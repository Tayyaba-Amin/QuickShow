import Booking from "../models/Booking.js";
import Show from "../models/Show.js"
import stripe from "stripe";

// Function to ckeck availability of selected seats for a movie
const checkSeatsAvailablility = async (showId, selectedSeats) => {
    try {
        const showData = await Show.findById(showId)
        if (!showData) return false;

        const occupiedSeats = showData.occupiedSeats;
        const isAnySeatTaken = selectedSeats.some(seat => occupiedSeats[seat]);
        return !isAnySeatTaken;
    } catch (error) {
        console.log(error.message);
        return false;
    }
}

// Create Booking
export const createBooking = async (req, res) => {
    try {
        const { userId } = req.auth();
        const { showId, selectedSeats } = req.body;
        const origin = req.headers.origin;

        if (!showId || !Array.isArray(selectedSeats) || selectedSeats.length === 0 || !origin) {
            return res.json({ success: false, message: "Invalid booking details." })
        }

        // Check if the seat is available for the selected show
        const isAvailable = await checkSeatsAvailablility(showId, selectedSeats)

        if (!isAvailable) {
            return res.json({ success: false, message: "Selected seats are not available." })
        }

        // Get the show details
        const showData = await Show.findById(showId).populate('movie');

        if (!showData || !showData.movie) {
            return res.json({ success: false, message: "Show not found." })
        }

        //Create a new booking
        const booking = await Booking.create(
            {
                user: userId,
                show: showId,
                amount: showData.showPrice * selectedSeats.length,
                bookedSeats: selectedSeats,

            }
        )

        selectedSeats.map((seat) => {
            showData.occupiedSeats[seat] = userId;
        })

        showData.markModified('occupiedSeats');
        await showData.save();

        // Stripe Gateway 
        const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY)

        //Line Items for stripe
        const line_items = [
            {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: showData.movie.title
                    },
                    unit_amount: Math.floor(booking.amount) * 100
                },
                quantity: 1
            }
        ]

        const session = await stripeInstance.checkout.sessions.create({
            success_url: `${origin}/loading/my-bookings`,
            cancel_url: `${origin}/my-bookings`,
            line_items: line_items,
            mode: 'payment',
            metadata: {
                bookingId: booking._id.toString()
            },
            expires_at: Math.floor(Date.now() / 1000) + 30 * 60
        });

        booking.paymentLink = session.url;
        await booking.save();

        res.json({ success: true, url: session.url })
    } catch (error) {
        console.log(error.message);
        return res.json({ success: false, message: error.message })
    }
}

// Get occupied seats
export const getOccupiedSeats = async (req, res) => {
    try {
        const { showId } = req.params;
        const showData = await Show.findById(showId);

        if (!showData) {
            return res.json({ success: false, message: "Show not found." })
        }

        const occupiedSeats = Object.keys(showData.occupiedSeats || {})

        res.json({ success: true, occupiedSeats })
    } catch (error) {
        console.log(error.message);
        return res.json({ success: false, message: error.message })
    }
}
