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


function response(data, status = 200) {

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


async function getUser(request) {

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
            await getUser(request);


        if (!user) {

            return response(
                {
                    error:
                        "Authentication required."
                },
                401
            );

        }


        const body =
            await request.json();


        const title =
            String(body.title || "").trim();

        const description =
            String(body.description || "").trim();

        const category =
            String(body.category || "").trim();

        const price =
            Number(body.price);

        const fileUrl =
            String(body.fileUrl || "").trim();


        const allowedCategories = [
            "astronomy",
            "seismology",
            "archaeology",
            "plate_tectonics",
            "general_science"
        ];


        if (
            title.length < 3 ||
            title.length > 150
        ) {

            return response(
                {
                    error:
                        "Product title must be 3-150 characters."
                },
                400
            );

        }


        if (
            description.length < 10 ||
            description.length > 5000
        ) {

            return response(
                {
                    error:
                        "Product description is invalid."
                },
                400
            );

        }


        if (
            !allowedCategories.includes(
                category
            )
        ) {

            return response(
                {
                    error:
                        "Invalid category."
                },
                400
            );

        }


        if (
            !Number.isFinite(price) ||
            price < 1 ||
            price > 100000
        ) {

            return response(
                {
                    error:
                        "Price must be between ₱1 and ₱100,000."
                },
                400
            );

        }


        try {

            new URL(fileUrl);

        } catch {

            return response(
                {
                    error:
                        "Invalid digital product URL."
                },
                400
            );

        }


        const {
            data: profile,
            error: profileError
        } =
            await supabaseAdmin
                .from("profiles")
                .select("is_seller")
                .eq("id", user.id)
                .single();


        if (
            profileError ||
            !profile?.is_seller
        ) {

            return response(
                {
                    error:
                        "Seller access is required."
                },
                403
            );

        }


        const {
            data,
            error
        } =
            await supabaseAdmin
                .from("products")
                .insert({

                    seller_id:
                        user.id,

                    title,

                    description,

                    category,

                    price,

                    file_url:
                        fileUrl,

                    status:
                        "published"

                })
                .select()
                .single();


        if (error) {

            console.error(error);

            return response(
                {
                    error:
                        "Unable to create product."
                },
                500
            );

        }


        return response({
            product: data
        }, 201);


    } catch (error) {

        console.error(error);

        return response(
            {
                error:
                    "Internal server error."
            },
            500
        );

    }

}
