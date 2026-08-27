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
                "Content-Type":
                    "application/json"
            }
        }
    );

}


async function authenticate(request) {

    const header =
        request.headers.get("authorization");


    if (!header?.startsWith("Bearer ")) {

        return null;

    }


    const token =
        header.substring(7);


    const {
        data,
        error
    } =
        await supabaseAdmin.auth.getUser(token);


    if (error) {

        return null;

    }


    return data.user || null;

}


export async function POST(request) {

    try {

        const user =
            await authenticate(request);


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


        const rating =
            Number(body.rating);


        const reviewText =
            String(
                body.reviewText || ""
            ).trim();


        if (!productId) {

            return json(
                {
                    error:
                        "Product ID is required."
                },
                400
            );

        }


        if (
            !Number.isInteger(rating) ||
            rating < 1 ||
            rating > 5
        ) {

            return json(
                {
                    error:
                        "Rating must be 1-5."
                },
                400
            );

        }


        if (
            reviewText.length < 2 ||
            reviewText.length > 2000
        ) {

            return json(
                {
                    error:
                        "Review must be 2-2000 characters."
                },
                400
            );

        }


        const {
            data: product,
            error: productError
        } =
            await supabaseAdmin
                .from("products")
                .select("id")
                .eq("id", productId)
                .eq("status", "published")
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


        const {
            data: paidOrder
        } =
            await supabaseAdmin
                .from("orders")
                .select("id")
                .eq("buyer_id", user.id)
                .eq("product_id", productId)
                .eq("status", "paid")
                .limit(1);


        if (!paidOrder?.length) {

            return json(
                {
                    error:
                        "Only verified buyers can review this product."
                },
                403
            );

        }


        const {
            data,
            error
        } =
            await supabaseAdmin
                .from("reviews")
                .upsert({

                    product_id:
                        productId,

                    buyer_id:
                        user.id,

                    rating,

                    review_text:
                        reviewText

                })
                .select()
                .single();


        if (error) {

            console.error(error);

            return json(
                {
                    error:
                        "Unable to save review."
                },
                500
            );

        }


        return json({
            review: data
        }, 201);


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
