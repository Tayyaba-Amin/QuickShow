import { Inngest } from "inngest";
import User from "../models/User.js";
import Booking from "../models/Booking.js";
import Show from "../models/Show.js";
import sendEmail from "../configs/nodeMailer.js";

export const inngest = new Inngest({
    id: "movie-ticket-booking",
});

// Create user
const syncUserCreation = inngest.createFunction(
    {
        id: "sync-user-from-clerk",
        triggers: {
            event: "clerk/user.created",
        },
    },
    async ({ event }) => {
        const {
            id,
            first_name,
            last_name,
            email_addresses,
            image_url,
        } = event.data;

        const userData = {
            _id: id,
            email: email_addresses[0].email_address,
            name: `${first_name || ""} ${last_name || ""}`.trim(),
            image: image_url,
        };

        await User.create(userData);
    }
);

// Update user
const syncUserUpdation = inngest.createFunction(
    {
        id: "update-user-from-clerk",
        triggers: {
            event: "clerk/user.updated",
        },
    },
    async ({ event }) => {
        const {
            id,
            first_name,
            last_name,
            email_addresses,
            image_url,
        } = event.data;

        const userData = {
            email: email_addresses[0].email_address,
            name: `${first_name || ""} ${last_name || ""}`.trim(),
            image: image_url,
        };

        await User.findByIdAndUpdate(id, userData);
    }
);

// Delete user
const syncUserDeletion = inngest.createFunction(
    {
        id: "delete-user-with-clerk",
        triggers: {
            event: "clerk/user.deleted",
        },
    },
    async ({ event }) => {
        const { id } = event.data;

        await User.findByIdAndDelete(id);

        console.log(`User ${id} deleted successfully`);
    }
);

// Cancel unpaid bookings and release their seats after the payment window expires.
const releaseSeatsAndDeleteBooking = inngest.createFunction(
    {
        id: "release-seats-delete-booking",
        triggers: {
            event: "app/checkpayment",
        },
    },
    async ({ event, step }) => {
        const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000)
        await step.sleepUntil("wait-for-10-minutes", tenMinutesLater);

        await step.run('check-paymet-status', async () => {
            const bookingId = event.data.bookingId
            const booking = await Booking.findById(bookingId);

            if (!booking.isPaid) {
                const show = await Show.findById(booking.show);
                booking.bookedSeats.forEach((seat) => {
                    delete show.occupiedSeats[seat];
                })

                show.markModified('occupiedSeats')
                await show.save();
                await Booking.findByIdAndDelete(booking._id)
            }
        })
    }
);

const sendBookingConfirmationEmail = inngest.createFunction(
    {
        id: "send-booking-confirmation-email",
        triggers: {
            event: "app/show.booked",
        },
    },
    async ({ event }) => {
        const { bookingId } = event.data;

        const booking = await Booking.findById(bookingId)
            .populate({
                path: "show",
                populate: { path: "movie", model: "Movie" },
            })
            .populate("user");

        if (!booking || !booking.user || !booking.show || !booking.show.movie) {
            console.log(`Booking confirmation skipped: invalid booking ${bookingId}`);
            return;
        }

        const showDate = new Date(booking.show.showDateTime).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
        });

        const bookedSeats = booking.bookedSeats?.join(", ") || "N/A";
        const movieTitle = booking.show.movie.title;

        const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; color: #0f172a; border-radius: 12px;">
                <div style="background: linear-gradient(135deg, #2563eb, #7c3aed); padding: 24px; border-radius: 12px; color: white; text-align: center;">
                    <h2 style="margin: 0; font-size: 28px;">🎟️ Booking Confirmed</h2>
                </div>

                <div style="padding: 24px 0;">
                    <p style="font-size: 16px; margin: 0 0 12px;">Hi <strong>${booking.user.name || "there"}</strong>,</p>
                    <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                        Your ticket for <strong>${movieTitle}</strong> has been successfully booked.
                    </p>
                </div>

                <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 20px;">
                    <p style="margin: 6px 0;"><strong>Movie:</strong> ${movieTitle}</p>
                    <p style="margin: 6px 0;"><strong>Date & Time:</strong> ${showDate}</p>
                    <p style="margin: 6px 0;"><strong>Seats:</strong> ${bookedSeats}</p>
                    <p style="margin: 6px 0;"><strong>Total Amount:</strong> $${Number(booking.amount || 0).toFixed(2)}</p>
                </div>

                <p style="font-size: 15px; line-height: 1.7; margin: 0 0 12px;">
                    We look forward to welcoming you at the theater. Please arrive 15 minutes before showtime.
                </p>

                <p style="font-size: 15px; margin: 0; color: #475569;">
                    Thank you for choosing QuickShow.
                </p>
            </div>
        `;

        await sendEmail({
            to: booking.user.email,
            subject: `Payment Confirmation: ${movieTitle} booked!`,
            body: emailBody,
        });
    }
);


const sendShowReminders = inngest.createFunction(
    {
        id: "send-show-reminders",
        triggers: {
            cron: "0 */8 * * *",
        },
    },
    async ({ step }) => {
        const now = new Date();
        const in8hours = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const windowStart = new Date(in8hours.getTime() - 10 * 60 * 1000);

        const reminderTasks = await step.run("prepare-reminder-tasks", async () => {
            const shows = await Show.find({
                showDateTime: {
                    $gte: windowStart,
                    $lte: in8hours,
                },
            }).populate("movie");

            const tasks = [];

            for (const show of shows) {
                if (!show.movie || !show.occupiedSeats) continue;

                const userIds = [...new Set(Object.values(show.occupiedSeats).filter(Boolean))];
                if (userIds.length === 0) continue;

                const users = await User.find({ _id: { $in: userIds } }).select("name email");

                for (const user of users) {
                    tasks.push({
                        userEmail: user.email,
                        userName: user.name || "there",
                        movieTitle: show.movie.title,
                        showTime: show.showDateTime,
                    });
                }
            }

            return tasks;
        });

        if (reminderTasks.length === 0) {
            return { sent: 0, message: "No reminders to send." };
        }

        const results = await step.run("send-all-reminders", async () => {
            return await Promise.allSettled(
                reminderTasks.map((task) => {
                    const showDate = new Date(task.showTime).toLocaleString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                    });

                    const emailBody = `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; color: #0f172a; border-radius: 12px;">
                            <div style="background: linear-gradient(135deg, #0f172a, #2563eb); padding: 24px; border-radius: 12px; color: white; text-align: center;">
                                <h2 style="margin: 0; font-size: 28px;">🎬 Movie Reminder</h2>
                            </div>

                            <div style="padding: 24px 0;">
                                <p style="font-size: 16px; margin: 0 0 12px;">Hi <strong>${task.userName}</strong>,</p>
                                <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                                    This is a quick reminder that your movie <strong>${task.movieTitle}</strong> is starting soon.
                                </p>
                            </div>

                            <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 20px;">
                                <p style="margin: 6px 0;"><strong>Movie:</strong> ${task.movieTitle}</p>
                                <p style="margin: 6px 0;"><strong>Showtime:</strong> ${showDate}</p>
                                <p style="margin: 6px 0;"><strong>Venue:</strong> QuickShow Cinema</p>
                            </div>

                            <p style="font-size: 15px; line-height: 1.7; margin: 0 0 12px;">
                                Please arrive at least 15 minutes before the show begins so you can grab your seats and enjoy the movie without rushing.
                            </p>

                            <p style="font-size: 15px; margin: 0; color: #475569;">
                                Thank you for choosing QuickShow.
                            </p>
                        </div>
                    `;

                    return sendEmail({
                        to: task.userEmail,
                        subject: `Reminder: Your movie "${task.movieTitle}" starts soon!`,
                        body: emailBody,
                    });
                })
            );
        });

        const sent = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.length - sent;

        return {
            sent,
            failed,
            message: `Sent ${sent} reminder(s), ${failed} failed.`,
        };
    }
);

const sendNewNotification = inngest.createFunction(
    {
        id: "send-new-show-notification",
        triggers: {
            event: "app/show.added",
        },
    },
    async ({ event }) => {
        const { movieTitle } = event.data;
        const users = await User.find();

        for (const user of users) {
            const userEmail = user.email;
            const userName = user.name || "there";
            const subject = `New Show Added: ${movieTitle}`;
            const body = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #f8fafc; color: #0f172a; border-radius: 12px;">
                    <div style="background: linear-gradient(135deg, #16a34a, #22c55e); padding: 24px; border-radius: 12px; color: white; text-align: center;">
                        <h2 style="margin: 0; font-size: 28px;">🎉 New Movie Alert</h2>
                    </div>

                    <div style="padding: 24px 0;">
                        <p style="font-size: 16px; margin: 0 0 12px;">Hi <strong>${userName}</strong>,</p>
                        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                            We’ve added a brand new show: <strong>${movieTitle}</strong>.
                        </p>
                    </div>

                    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 20px;">
                        <p style="margin: 6px 0;"><strong>Movie:</strong> ${movieTitle}</p>
                        <p style="margin: 6px 0;"><strong>Featured:</strong> Now available for booking</p>
                        <p style="margin: 6px 0;"><strong>Action:</strong> Book your seats before they sell out</p>
                    </div>

                    <p style="font-size: 15px; line-height: 1.7; margin: 0 0 12px;">
                        Don’t miss your chance to watch this exciting feature in the theater.
                    </p>

                    <p style="font-size: 15px; margin: 0; color: #475569;">
                        Thank you for choosing QuickShow.
                    </p>
                </div>
            `;

            await sendEmail({
                to: userEmail,
                subject,
                body,
            });
        }

        return { message: "Notification sent." };
    }
);
export const functions = [
    syncUserCreation,
    syncUserUpdation,
    syncUserDeletion,
    releaseSeatsAndDeleteBooking,
    sendBookingConfirmationEmail,
    sendShowReminders,
    sendNewNotification
];