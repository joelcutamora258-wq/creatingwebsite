import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function verifySignature(payload, signatureHeader, secret) {
  if (!signatureHeader || !secret) {
    return false;
  }

  const parts = signatureHeader
    .split(",")
    .map((value) => value.trim());

  let timestamp = null;
  let testSignature = null;
  let liveSignature = null;

  for (const part of parts) {
    const [key, value] = part.split("=");

    if (key === "t") {
      timestamp = value;
    }

    if (key === "te") {
      testSignature = value;
    }

    if (key === "li") {
      liveSignature = value;
    }
  }

  if (!timestamp) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const received =
    process.env.PAYMONGO_LIVEMODE === "true"
      ? liveSignature
      : testSignature;

  if (!received) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(received, "utf8")
    );
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    // Read the raw body first.
    // This is important because PayMongo's signature
    // verification uses the exact raw request body.
    const rawBody = await request.text();

    const signature = request.headers.get("Paymongo-Signature");

    /*
     * Verify the PayMongo webhook signature when the
     * webhook secret has been added to Vercel.
     *
     * For initial testing, this can remain disabled by
     * leaving PAYMONGO_WEBHOOK_SECRET empty.
     */
    if (process.env.PAYMONGO_WEBHOOK_SECRET) {
      const valid = verifySignature(
        rawBody,
        signature,
        process.env.PAYMONGO_WEBHOOK_SECRET
      );

      if (!valid) {
        return json(
          {
            error: "Invalid webhook signature.",
          },
          401
        );
      }
    }

    let body;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(
        {
          error: "Invalid JSON payload.",
        },
        400
      );
    }

    /*
     * PayMongo webhook structure:
     *
     * body.data.attributes.type
     */
    const event = body?.data;

    const eventType =
      event?.attributes?.type ||
      body?.event_type;

    /*
     * We only process successful Hosted Checkout payments.
     *
     * PayMongo event:
     * checkout_session.payment.paid
     */
    if (eventType !== "checkout_session.payment.paid") {
      return json({
        received: true,
        ignored: true,
        eventType,
      });
    }

    /*
     * The Checkout Session is inside:
     *
     * data.attributes.data
     */
    const session =
      event?.attributes?.data ||
      body?.data?.data ||
      body?.data;

    const attributes = session?.attributes || {};

    /*
     * Get the order reference / metadata.
     */
    const referenceNumber =
      attributes.reference_number || null;

    const metadata =
      attributes.metadata || {};

    const orderId =
      metadata.order_id || null;

    /*
     * We need either an order ID or reference number
     * to know which order to mark as paid.
     */
    if (!referenceNumber && !orderId) {
      console.warn(
        "PayMongo payment received without order reference."
      );

      return json({
        received: true,
        warning:
          "Payment received without an order reference.",
      });
    }

    /*
     * Find the order in Supabase.
     */
    let orderQuery = supabaseAdmin
      .from("orders")
      .select("*")
      .limit(1);

    if (orderId) {
      orderQuery = orderQuery.eq("id", orderId);
    } else {
      orderQuery = orderQuery.eq(
        "reference_number",
        referenceNumber
      );
    }

    const {
      data: orders,
      error: orderLookupError,
    } = await orderQuery;

    if (orderLookupError) {
      console.error(
        "Supabase order lookup failed:",
        orderLookupError
      );

      return json(
        {
          error: "Database lookup failed.",
        },
        500
      );
    }

    const order = orders?.[0];

    if (!order) {
      console.error(
        "Order not found:",
        {
          orderId,
          referenceNumber,
        }
      );

      return json(
        {
          error: "Order not found.",
        },
        404
      );
    }

    /*
     * Idempotency:
     *
     * PayMongo can retry webhook deliveries.
     * Don't mark the same order as paid twice.
     */
    if (order.status === "paid") {
      return json({
        received: true,
        duplicate: true,
      });
    }

    /*
     * Try to obtain the payment information.
     */
    const payment =
      attributes.payments?.[0] ||
      attributes.payment ||
      null;

    const paymentId =
      payment?.id || null;

    /*
     * PayMongo amounts are normally represented
     * in the smallest currency unit (centavos).
     */
    const paidAmount =
      attributes.amount != null
        ? Number(attributes.amount) / 100
        : Number(order.amount);

    /*
     * Mark the order as paid.
     */
    const {
      error: updateError,
    } = await supabaseAdmin
      .from("orders")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paymongo_payment_id: paymentId,
        payment_payload: body,
      })
      .eq("id", order.id);

    if (updateError) {
      console.error(
        "Unable to update order:",
        updateError
      );

      return json(
        {
          error: "Unable to update order.",
        },
        500
      );
    }

    console.log(
      "PayMongo payment confirmed:",
      {
        orderId: order.id,
        paymentId,
        amount: paidAmount,
        referenceNumber,
      }
    );

    /*
     * PayMongo expects a successful 2xx response.
     */
    return json({
      received: true,
      paid: true,
    });
  } catch (error) {
    console.error(
      "PayMongo webhook error:",
      error
    );

    return json(
      {
        error: "Webhook processing failed.",
      },
      500
    );
  }
}
