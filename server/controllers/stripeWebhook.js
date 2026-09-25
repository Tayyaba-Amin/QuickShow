import stripe from 'stripe';
import Booking from '../models/Booking.js';
import { inngest } from '../inngest/index.js';

export const stripeWebhook = async (req, res) => {
    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY)
    const sig = req.headers["stripe-signature"]

    let event;
    try {
        event = stripeInstance.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    } catch (error) {
        return res.status(400).send(`Webhook Error:${error.message}`)
    }

    try {
        switch (event.type) {
            case "checkout.session.completed":
            case "payment_intent.succeeded": {
                let session = event.data.object;

                if (event.type === "payment_intent.succeeded") {
                    const sessionList = await stripeInstance.checkout.sessions.list({
                        payment_intent: session.id
                    });
                    session = sessionList.data[0];
                }

                const bookingId = session?.metadata?.bookingId;
                if (!bookingId) {
                    break;
                }

                const booking = await Booking.findById(bookingId);
                if (!booking || booking.isPaid) {
                    break;
                }

                await Booking.findByIdAndUpdate(bookingId, {
                    isPaid: true,
                    paymentLink: ""
                });

                await inngest.send({
                    name: "app/show.booked",
                    data: { bookingId }
                });

                break;
            }

            default:
                console.log("Unhandled event type:", event.type);
        }

        res.json({ received: true })
    } catch (error) {
        console.error("Webhook processing error:", error)
        res.status(500).send("Internal Server Error")
    }
}