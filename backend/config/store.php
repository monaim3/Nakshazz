<?php

return [

    /*
    | Public storefront (Next.js) URL. Used for CORS, links in emails and
    | on-demand revalidation calls.
    */
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:3000'),

    /*
    | Shared secret sent to the Next.js revalidation endpoint so the storefront
    | refreshes within seconds of a product or banner change.
    */
    'revalidate_secret' => env('REVALIDATE_SECRET'),

    'order_number_prefix' => env('ORDER_NUMBER_PREFIX', 'NK'),

    /*
    | First owner account created by OwnerSeeder.
    */
    'seed_owner' => [
        'name' => env('SEED_OWNER_NAME', 'Store Owner'),
        'email' => env('SEED_OWNER_EMAIL', 'owner@nakshazz.test'),
        'password' => env('SEED_OWNER_PASSWORD'),
    ],

];
