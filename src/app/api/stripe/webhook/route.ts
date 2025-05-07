import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe"; // Your Stripe client from lib/stripe.ts
import { PrismaClient, PlanType } from "@prisma/client";

const prisma = new PrismaClient();

const relevantEvents = new Set([
  "checkout.session.completed",
  "customer.subscription.created", // Useful for initial setup if not handled by checkout.session.completed
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid", // To confirm recurring payments and extend access
  "invoice.payment_failed", // To handle failed payments and potentially restrict access
]);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = headers().get("Stripe-Signature") as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    console.error("Stripe webhook secret or signature missing.");
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  if (relevantEvents.has(event.type)) {
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === "subscription" && session.subscription && session.client_reference_id) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            await prisma.user.update({
              where: { id: session.client_reference_id }, // client_reference_id should be your internal user ID
              data: {
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: subscription.customer as string,
                stripePriceId: subscription.items.data[0].price.id,
                stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
                plan: getPlanTypeFromPriceId(subscription.items.data[0].price.id),
              },
            });
          }
          break;
        }
        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const userId = subscription.metadata.userId; // Assuming you store userId in subscription metadata
            if (userId) {
                await prisma.user.update({
                    where: { id: userId },
                    data: {
                        stripePriceId: subscription.items.data[0].price.id,
                        stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
                        plan: getPlanTypeFromPriceId(subscription.items.data[0].price.id),
                    },
                });
            }
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const userId = subscription.metadata.userId; // Assuming you store userId in subscription metadata
          if (userId) {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    stripeSubscriptionId: subscription.id,
                    stripeCustomerId: subscription.customer as string,
                    stripePriceId: subscription.items.data[0].price.id,
                    stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
                    plan: event.type === "customer.subscription.deleted" ? PlanType.FREE : getPlanTypeFromPriceId(subscription.items.data[0].price.id),
                },
            });
          }
          break;
        }
        case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.subscription) {
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
                const userId = subscription.metadata.userId;
                if (userId) {
                    // Optionally, downgrade user to FREE plan or mark as payment failed
                    // For now, just logging it
                    console.warn(`Invoice payment failed for user ${userId}, subscription ${subscription.id}`);
                }
            }
            break;
        }
        default:
          console.warn(`Unhandled relevant event type: ${event.type}`);
      }
    } catch (error) {
      console.error("Error processing webhook event:", error);
      return NextResponse.json(
        { message: "Webhook handler failed. View logs." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}

function getPlanTypeFromPriceId(priceId: string): PlanType {
  if (priceId === process.env.STRIPE_BASIC_PLAN_PRICE_ID) {
    return PlanType.BASIC;
  }
  if (priceId === process.env.STRIPE_PREMIUM_PLAN_PRICE_ID) {
    return PlanType.PREMIUM;
  }
  return PlanType.FREE; // Default or if priceId doesn't match known paid plans
}

