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


export async function GET(request) {

    try {

        const authorization =
            request.headers.get(
                "authorization"
            );


        if (
            !authorization?.startsWith(
                "Bearer "
            )
        ) {

            return json(
                {
                    error:
                        "Authentication required."
                },
                401
            );

        }


        const token =
            authorization.substring(7);


        const {
            data: authData,
            error: authError
        } =
            await supabaseAdmin.auth.getUser(
                token
            );


        if (
            authError ||
            !authData.user
        ) {

            return json(
                {
                    error:
                        "Invalid session."
                },
                401
            );

        }


        const user =
            authData.user;


        const {
            data: sales,
            error: salesError
        } =
            await supabaseAdmin
                .from("orders")
                .select(`
                    id,
                    reference_number,
                    amount,
                    seller_amount,
                    status,
                    paid_at,
                    products (
                        title
                    )
                `)
                .eq(
                    "seller_id",
                    user.id
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (salesError) {

            console.error(salesError);

            return json(
                {
                    error:
                        "Unable to load sales."
                },
                500
            );

        }


        const {
            data: purchases,
            error: purchaseError
        } =
            await supabaseAdmin
                .from("orders")
                .select(`
                    id,
                    reference_number,
                    amount,
                    status,
                    paid_at,
                    products (
                        title
                    )
                `)
                .eq(
                    "buyer_id",
                    user.id
                )
                .order(
                    "created_at",
                    {
                        ascending: false
                    }
                );


        if (purchaseError) {

            console.error(purchaseError);

            return json(
                {
                    error:
                        "Unable to load purchases."
                },
                500
            );

        }


        const normalizedSales =
            (sales || []).map(item => ({

                ...item,

                product_title:
                    item.products?.title ||
                    "Science Product"

            }));


        const normalizedPurchases =
            (purchases || []).map(item => ({

                ...item,

                product_title:
                    item.products?.title ||
                    "Science Product"

            }));


        return json({

            sales:
                normalizedSales,

            purchases:
                normalizedPurchases

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
