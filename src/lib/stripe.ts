import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-04-10", // Use the latest API version
  typescript: true,
});

// Helper function to get the base URL of the application
export function getURL() {
  const url = process.env.NEXTAUTH_URL || // Set in .env.local
              process.env.VERCEL_URL || // Automatically set by Vercel
              "http://localhost:3000";
  return url.startsWith("http") ? url : `https://${url}`;
}

// Function to create a Stripe Checkout session
export async function createStripeCheckoutSession(userId: string, userEmail: string, priceId: string) {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "subscription",
      customer_email: userEmail, // Pre-fill email
      client_reference_id: userId, // Associate checkout session with user ID
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${getURL()}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getURL()}/pricing`, // Or any other relevant cancel URL
      // metadata: { userId }, // Optional: if you need to pass more data
      subscription_data: {
        metadata: {
          userId: userId, // Store userId in subscription metadata
        },
      },
    });
    return { sessionId: session.id, url: session.url };
  } catch (error) {
    console.error("Error creating Stripe Checkout session:", error);
    throw error;
  }
}

// Function to create a Stripe Customer Portal session
export async function createStripeCustomerPortalSession(stripeCustomerId: string) {
  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${getURL()}/dashboard/billing`,
    });
    return { url: portalSession.url };
  } catch (error) {
    console.error("Error creating Stripe Customer Portal session:", error);
    throw error;
  }
}

