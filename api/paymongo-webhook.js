import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";


const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);


function json(data, status = 200) {

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );

}


function verifySignature(
    payload,
    signatureHeader,
    secret
) {

    if (!signatureHeader || !secret) {

        return false;

    }


    const parts =
        signatureHeader
            .split(",")
            .map(value => value.trim());


    let timestamp = null;
    let testSignature = null;
    let liveSignature = null;


    for (const part of parts) {

        const [key, value] =
            part.split("=");


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


    const expected =
        crypto
            .createHmac(
                "sha256",
                secret
            )
            .update(
                `${timestamp}.${payload}`
            )
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

        const rawBody =
            await request.text();


        const signature =
            request.headers.get(
                "Paymongo-Signature"
            );


        /*
         * Enable this verification once you copy
         * the webhook signing secret from PayMongo.
         *
         * PayMongo signs webhook deliveries.
         */

        if (
            process.env.PAYMONGO_WEBHOOK_SECRET
        ) {

            const valid =
                verifySignature(
                    rawBody,
                    signature,
                    process.env.PAYMONGO_WEBHOOK_SECRET
                );


            if (!valid) {

                return json(
                    {
                        error:
                            "Invalid webhook signature."
                    },
                    401
                );

            }

        }


        const body =
            JSON.parse(rawBody);


        const event =
            body?.data;


        const eventType =
            event?.attributes?.type ||
            body?.event_type;


        /*
         * Current Hosted Checkout event.
         */

        if (
            eventType !==
            "checkout_session.payment.paid"
        ) {

            return json({
                received: true
            });

        }


        const session =
            event?.attributes?.data ||
            body?.data?.data ||
            body?.data;


        const attributes =
            session?.attributes || {};


        const referenceNumber =
            attributes.reference_number;


        const metadata =
            attributes.metadata || {};


        const orderId =
            metadata.order_id;


        if (
            !referenceNumber &&
            !orderId
        ) {

            return json({
                received: true,
                warning:
                    "Payment received without an order reference."
            });

        }


        let orderQuery =
            supabaseAdmin
                .from("orders")
                .select("*")
                .limit(1);


        if (orderId) {

            orderQuery =
                orderQuery.eq(
                    "id",
                    orderId
                );

        } else {

            orderQuery =
                orderQuery.eq(
                    "reference_number",
                    referenceNumber
                );

        }


        const {
            data: orders,
            error: orderLookupError
        } = await orderQuery;


        if (orderLookupError) {

            console.error(
                orderLookupError
            );

            return json(
                {
                    error:
                        "Database lookup failed."
                },
                500
            );

        }


        const order =
            orders?.[0];


        if (!order) {

            return json(
                {
                    error:
                        "Order not found."
                },
                404
            );

        }


        /*
         * Idempotency:
         *
         * If PayMongo retries the same event,
         * don't create a second purchase.
         */

        if (order.status === "paid") {

            return json({
                received: true,
                duplicate: true
            });

        }


        const payment =
            attributes.payments?.[0] ||
            attributes.payment ||
            null;


        const paymentId =
            payment?.id ||
            null;


        const paidAmount =
            Number(
                attributes.amount ||
                order.amount
            ) / (
                attributes.amount
                    ? 100
                    : 1
            );


        const {
            error: updateError
        } =
            await supabaseAdmin
                .from("orders")
                .update({

                    status: "paid",

                    paid_at:
                        new Date().toISOString(),

                    paymongo_payment_id:
                        paymentId,

                    payment_payload:
                        body

                })
                .eq(
                    "id",
                    order.id
                );


        if (updateError) {

            console.error(
                updateError
            );

            return json(
                {
                    error:
                        "Unable to update order."
                },
                500
            );

        }


        console.log(
            "Payment confirmed:",
            {
                orderId: order.id,
                paymentId,
                amount: paidAmount
            }
        );


        return json({
            received: true
        });


    } catch (error) {

        console.error(error);

        return json(
            {
                error:
                    "Webhook processing failed."
            },
            500
        );

    }

}
