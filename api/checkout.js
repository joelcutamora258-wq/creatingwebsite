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


async function getAuthenticatedUser(request) {

    const authorization =
        request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {

        return null;

    }


    const token =
        authorization.substring(7);


    const {
        data,
        error
    } = await supabaseAdmin.auth.getUser(token);


    if (error || !data?.user) {

        return null;

    }


    return data.user;

}


export async function POST(request) {

    try {

        const user =
            await getAuthenticatedUser(request);


        if (!user) {

            return json(
                {
                    error:
                        "Authentication required."
                },
                401
            );

        }


        const body =
            await request.json();


        const productId =
            String(body.productId || "");


        if (!productId) {

            return json(
                {
                    error:
                        "Product ID is required."
                },
                400
            );

        }


        const {
            data: product,
            error: productError
        } = await supabaseAdmin
            .from("products")
            .select(`
                id,
                seller_id,
                title,
                description,
                price,
                status
            `)
            .eq("id", productId)
            .single();


        if (
            productError ||
            !product
        ) {

            return json(
                {
                    error:
                        "Product not found."
                },
                404
            );

        }


        if (product.status !== "published") {

            return json(
                {
                    error:
                        "Product is not available."
                },
                400
            );

        }


        if (product.seller_id === user.id) {

            return json(
                {
                    error:
                        "You cannot purchase your own product."
                },
                400
            );

        }


        const amountCentavos =
            Math.round(
                Number(product.price) * 100
            );


        if (
            !Number.isInteger(amountCentavos) ||
            amountCentavos < 100
        ) {

            return json(
                {
                    error:
                        "Invalid product price."
                },
                400
            );

        }


        const orderReference =
            `SCI-${crypto.randomUUID()}`;


        const {
            data: order,
            error: orderError
        } = await supabaseAdmin
            .from("orders")
            .insert({

                buyer_id: user.id,

                seller_id:
                    product.seller_id,

                product_id:
                    product.id,

                reference_number:
                    orderReference,

                amount:
                    Number(product.price),

                status:
                    "pending"

            })
            .select()
            .single();


        if (orderError) {

            console.error(orderError);

            return json(
                {
                    error:
                        "Unable to create order."
                },
                500
            );

        }


        const siteUrl =
            process.env.SITE_URL;


        if (!siteUrl) {

            return json(
                {
                    error:
                        "SITE_URL is not configured."
                },
                500
            );

        }


        const paymongoResponse =
            await fetch(
                "https://api.paymongo.com/v2/checkout_sessions",
                {

                    method: "POST",

                    headers: {

                        "Authorization":
                            `Basic ${Buffer
                                .from(
                                    `${process.env.PAYMONGO_SECRET_KEY}:`
                                )
                                .toString("base64")}`,

                        "Content-Type":
                            "application/json"

                    },

                    body: JSON.stringify({

                        data: {

                            attributes: {

                                line_items: [

                                    {

                                        currency:
                                            "PHP",

                                        amount:
                                            amountCentavos,

                                        description:
                                            product.title,

                                        name:
                                            product.title,

                                        quantity:
                                            1

                                    }

                                ],

                                payment_method_types: [
                                    "gcash",
                                    "grab_pay",
                                    "paymaya",
                                    "card"
                                ],

                                reference_number:
                                    orderReference,

                                description:
                                    `ScienceMarket purchase: ${product.title}`,

                                send_email_receipt:
                                    true,

                                success_url:
                                    `${siteUrl}/?payment=success`,

                                cancel_url:
                                    `${siteUrl}/?payment=cancelled`,

                                metadata: {

                                    order_id:
                                        order.id,

                                    product_id:
                                        product.id,

                                    buyer_id:
                                        user.id,

                                    seller_id:
                                        product.seller_id

                                }

                            }

                        }

                    })

                }
            );


        const paymongoData =
            await paymongoResponse.json();


        if (!paymongoResponse.ok) {

            console.error(
                "PayMongo error:",
                paymongoData
            );


            await supabaseAdmin
                .from("orders")
                .update({
                    status: "cancelled"
                })
                .eq("id", order.id);


            return json(
                {
                    error:
                        "PayMongo checkout could not be created."
                },
                502
            );

        }


        const checkoutSession =
            paymongoData?.data;


        const checkoutUrl =
            checkoutSession?.attributes?.checkout_url;


        if (!checkoutUrl) {

            return json(
                {
                    error:
                        "PayMongo did not return a checkout URL."
                },
                502
            );

        }


        await supabaseAdmin
            .from("orders")
            .update({

                paymongo_checkout_session_id:
                    checkoutSession.id

            })
            .eq("id", order.id);


        return json({
            checkoutUrl
        });


    } catch (error) {

        console.error(error);

        return json(
            {
                error:
                    "Internal server error."
            },
            500
        );

    }

}
