# QuickShow

QuickShow is a movie ticket booking application with a React frontend, Express backend, MongoDB data layer, Stripe payments, Clerk authentication, and Inngest-based background jobs for reminders and notifications.

## Features

- Browse now-playing movies and movie details
- View movie listings
- Add movies to favorites
- Select show date/time and choose seats
- Book tickets with Stripe checkout
- View booking history for authenticated users
- Admin dashboard for managing shows and bookings
- Automatic seat release for unpaid bookings
- Email notifications for booking confirmation, reminders, and new-show announcements

## Tech Stack

### Frontend

- React
- Vite
- React Router
- Tailwind CSS
- Clerk auth UI
- React Hot Toast
- Lucide icons

### Backend

- Node.js
- Express
- MongoDB + Mongoose
- Stripe
- Nodemailer
- Inngest
- TMDB API integration

## Project Structure

```bash
QuickShow/
├── client/                  # React frontend
│   ├── public/
│   ├── src/
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
│
├── server/                  # Express API and background jobs
│   ├── configs/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── inngest/
│   ├── server.js
│   ├── package.json
│   └── vercel.json
│
├── .gitignore
├── README.md
```

## Prerequisites

Before running the project, make sure you have:

- Node.js 18+
- MongoDB instance or MongoDB Atlas connection string
- Clerk account and API keys
- Stripe account and secret keys
- TMDB API key
- SMTP provider credentials (Brevo / SendGrid / similar)

## Environment Variables

### Client (.env in client/)

```env
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_BASE_URL=http://localhost:3000
VITE_TMBD_IMAGE_BASE_URL=https://image.tmdb.org/t/p/original
```

### Server (.env in server/)

```env
MONGO_URI=your_mongodb_connection_string
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key
INNGEST_EVENT_KEY=inngest_event_key
INNGEST_SIGNING_KEY=inngest_signing_key
TMBD_API_KEY=your_tmdb_api_key
STRIPE_PUBLISHABLE_KEY=stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SENDER_EMAIL=your_sender_email
```

## Installation

### 1. Install frontend dependencies

```bash
cd client
npm install
```

### 2. Install backend dependencies

```bash
cd server
npm install
```

## Running the Project

### Start backend

```bash
cd server
npm run dev
```

This starts the Express API and Inngest functions.

### Start frontend

```bash
cd client
npm run dev
```

The frontend will run on the Vite development server, typically on:

```text
http://localhost:5173
```

## Production Build

### Frontend build

```bash
cd client
npm run build
```

### Backend start

```bash
cd server
npm start
```

## Main API Routes

### Public / show routes

- `GET /api/show/all`
- `GET /api/show/now-playing`
- `GET /api/show/:movieId`
- `POST /api/show/add`

### Booking routes

- `GET /api/booking/seats/:showId`
- `POST /api/booking/create`

### Admin routes

- `GET /api/admin/is-admin`
- `GET /api/admin/dashboard`
- `GET /api/admin/all-bookings`
- `GET /api/admin/all-shows`

### User routes

- `GET /api/user/bookings`
- `POST /api/user/update-favorite`
- `GET /api/user/favorites`

### Inngest

- `GET /api/inngest`
- Background jobs are triggered by events like:
  - `clerk/user.created`
  - `clerk/user.updated`
  - `clerk/user.deleted`
  - `app/show.booked`
  - `app/show.added`
  - `app/checkpayment`

## Important Notes

- The frontend uses Clerk for authentication and user session checks.
- The admin area is protected and only accessible to authorized users.
- Stripe checkout sessions are created on the backend and webhook events are processed for payment verification.
- Inngest handles reminders and email communication after key actions.
- The app depends on TMDB data to fetch movie information and posters.

## Recommended Next Improvements

- Add search/filter support for movies
- Improve seat selection UX
- Add admin analytics and sales reporting
- Add QR code-based ticket validation
- Add Docker setup for easier deployment

## License

This project is for learning and personal project use. Update this section if you plan to publish it under a specific license.

## Authors

Built as a movie booking system demo using React, Express, MongoDB, and Stripe.
