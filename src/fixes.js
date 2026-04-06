/**
 * Fix generators — given a list of allowed origins, output platform-specific
 * CORS configuration that replaces the wildcard.
 */

const PLATFORMS = {
  generic: "Generic (any server / language-agnostic)",
  vercel: "Vercel (vercel.json)",
  express: "Express (cors middleware)",
  nextjs: "Next.js (next.config.js)",
  nginx: "Nginx",
  apache: "Apache (.htaccess / httpd.conf)",
  caddy: "Caddy (Caddyfile)",
  cloudflare: "Cloudflare Workers",
  fastify: "Fastify",
  hono: "Hono (edge / serverless)",
  netlify: "Netlify (Edge Functions)",
  firebase: "Firebase (firebase.json + Cloud Functions)",
  aws: "AWS (API Gateway / Lambda)",
  supabase: "Supabase (Edge Functions / PostgREST)",
  deno: "Deno / Deno Deploy",
  flask: "Flask (flask-cors)",
  django: "Django (django-cors-headers)",
  laravel: "Laravel (PHP)",
  rails: "Rails (rack-cors)",
  spring: "Spring Boot (Java / Kotlin)",
  go: "Go (net/http)",
  dotnet: "ASP.NET Core",
};

/**
 * @param {string[]} origins - Allowed origins (e.g. ["https://example.com"])
 * @param {string} [platform] - Target platform, or "all"
 * @returns {{ platform: string, label: string, code: string }[]}
 */
export function generateFixes(origins, platform = "all") {
  const normalized = origins.map(o => {
    if (o.startsWith("http")) return o;
    return `https://${o}`;
  });

  const generators = {
    generic: () => genericFix(normalized),
    vercel: () => vercelFix(normalized),
    express: () => expressFix(normalized),
    nextjs: () => nextjsFix(normalized),
    nginx: () => nginxFix(normalized),
    apache: () => apacheFix(normalized),
    caddy: () => caddyFix(normalized),
    cloudflare: () => cloudflareFix(normalized),
    fastify: () => fastifyFix(normalized),
    hono: () => honoFix(normalized),
    netlify: () => netlifyFix(normalized),
    firebase: () => firebaseFix(normalized),
    aws: () => awsFix(normalized),
    supabase: () => supabaseFix(normalized),
    deno: () => denoFix(normalized),
    flask: () => flaskFix(normalized),
    django: () => djangoFix(normalized),
    laravel: () => laravelFix(normalized),
    rails: () => railsFix(normalized),
    spring: () => springFix(normalized),
    go: () => goFix(normalized),
    dotnet: () => dotnetFix(normalized),
  };

  if (platform !== "all" && generators[platform]) {
    return [{ platform, label: PLATFORMS[platform], code: generators[platform]() }];
  }

  return Object.entries(generators).map(([key, fn]) => ({
    platform: key,
    label: PLATFORMS[key],
    code: fn(),
  }));
}

export function listPlatforms() {
  return Object.entries(PLATFORMS).map(([key, label]) => ({ key, label }));
}

// ── Platform fix generators ──

function vercelFix(origins) {
  const config = {
    headers: [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ],
  };

  return `// vercel.json — static headers (for non-API routes)
${JSON.stringify(config, null, 2)}

// For API routes or dynamic CORS, use a middleware/serverless function:
// api/cors-example.js
export default function handler(req, res) {
  const allowedOrigins = ${JSON.stringify(origins)};
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  // ... your handler
}`;
}

function expressFix(origins) {
  return `import cors from "cors";

const allowedOrigins = ${JSON.stringify(origins)};

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(\`Origin \${origin} not allowed by CORS\`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));`;
}

function nextjsFix(origins) {
  return `// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;

// For dynamic origin checking, use middleware:
// middleware.ts
import { NextResponse } from "next/server";

const allowedOrigins = ${JSON.stringify(origins)};

export function middleware(request) {
  const origin = request.headers.get("origin");
  const response = NextResponse.next();

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }

  return response;
}`;
}

function nginxFix(origins) {
  const mapEntries = origins.map(o => `        "${o}"  "${o}";`).join("\n");
  return `# nginx.conf

map $http_origin $cors_origin {
    default         "";
${mapEntries}
}

server {
    location /api/ {
        if ($cors_origin != "") {
            add_header Access-Control-Allow-Origin  $cors_origin always;
            add_header Vary                         "Origin" always;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" always;
            add_header Access-Control-Allow-Headers "Content-Type, Authorization" always;
            add_header Access-Control-Allow-Credentials "true" always;
        }

        if ($request_method = OPTIONS) {
            return 204;
        }
    }
}`;
}

function cloudflareFix(origins) {
  return `// Cloudflare Worker — src/index.js
const allowedOrigins = new Set(${JSON.stringify(origins)});

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    // Handle preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const response = await fetch(request);
    const newResponse = new Response(response.body, response);

    for (const [key, value] of Object.entries(corsHeaders(origin))) {
      newResponse.headers.set(key, value);
    }

    return newResponse;
  },
};

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}`;
}

function fastifyFix(origins) {
  return `import fastifyCors from "@fastify/cors";

await fastify.register(fastifyCors, {
  origin: ${JSON.stringify(origins)},
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});`;
}

function netlifyFix(origins) {
  // Netlify doesn't support dynamic origin in static _headers,
  // so we use Edge Functions
  return `// netlify/edge-functions/cors.ts
import type { Context } from "@netlify/edge-functions";

const allowedOrigins = ${JSON.stringify(origins)};

export default async (request: Request, context: Context) => {
  const origin = request.headers.get("origin");
  const response = await context.next();

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }

  return response;
};

export const config = { path: "/api/*" };`;
}

function flaskFix(origins) {
  return `# pip install flask-cors
from flask_cors import CORS

CORS(app, origins=${JSON.stringify(origins)}, supports_credentials=True)`;
}

function djangoFix(origins) {
  const pyList = origins.map(o => `    "${o}",`).join("\n");
  return `# pip install django-cors-headers
# settings.py

INSTALLED_APPS = [
    # ...
    "corsheaders",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # Must be high in the list
    # ...
]

CORS_ALLOWED_ORIGINS = [
${pyList}
]

CORS_ALLOW_CREDENTIALS = True`;
}

function railsFix(origins) {
  const rbList = origins.map(o => `      '${o}'`).join(",\n");
  return `# Gemfile: gem 'rack-cors'
# config/initializers/cors.rb

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins(
${rbList}
    )

    resource '/api/*',
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options],
      credentials: true
  end
end`;
}

function genericFix(origins) {
  const originList = origins.map(o => `  "${o}"`).join(",\n");
  return `# ─── CORS Fix: Language-Agnostic Guide ───
#
# The logic below works in ANY language or server. Implement it
# wherever your server sets response headers.
#
# ALLOWED_ORIGINS = [
${originList}
# ]
#
# ─── Pseudocode ───
#
# on_request(request, response):
#
#   origin = request.headers["Origin"]
#
#   # 1. Check if the origin is in your allow-list
#   if origin IN ALLOWED_ORIGINS:
#       response.headers["Access-Control-Allow-Origin"] = origin
#       response.headers["Vary"] = "Origin"
#       response.headers["Access-Control-Allow-Credentials"] = "true"
#
#   # 2. Handle preflight (OPTIONS) requests
#   if request.method == "OPTIONS":
#       response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
#       response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
#       response.headers["Access-Control-Max-Age"] = "86400"
#       return response(status=204, body="")
#
#   # 3. Continue to your normal handler
#   ...
#
# ─── Key Rules ───
#
# - NEVER use Access-Control-Allow-Origin: *
#   Always check against an explicit list.
#
# - ALWAYS include Vary: Origin when the ACAO value is dynamic.
#   Without it, caches (CDNs, proxies) can serve the wrong origin
#   to the wrong user.
#
# - Return 204 (No Content) for OPTIONS preflight requests.
#   Browsers send these before non-simple requests (PUT, DELETE,
#   custom headers like Authorization).
#
# - Access-Control-Max-Age caches preflight results in the browser
#   so it doesn't re-send OPTIONS on every request. 86400 = 24 hrs.
#
# - If you don't need cookies/auth across origins, omit
#   Access-Control-Allow-Credentials entirely.
#
# ─── Common Mistakes ───
#
# BAD:  endsWith(origin, "example.com")
#       → allows evil-example.com
#
# BAD:  contains(origin, "example")
#       → allows example.evil.com
#
# GOOD: ALLOWED_ORIGINS.includes(origin)
#       → exact match only`;
}

function caddyFix(origins) {
  const matchers = origins.map(o => `        header Origin ${o}`).join("\n");
  return `# Caddyfile
your-domain.com {
    @cors {
${matchers}
    }

    header @cors {
        Access-Control-Allow-Origin  {header.Origin}
        Vary                         Origin
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Authorization"
        Access-Control-Allow-Credentials "true"
    }

    @preflight method OPTIONS
    respond @preflight 204

    # ... your site config
    reverse_proxy localhost:3000
}`;
}

function firebaseFix(origins) {
  return `// ─── Option 1: firebase.json (static hosting headers) ───
// Only allows a single origin — use Cloud Functions for multiple.
{
  "hosting": {
    "headers": [
      {
        "source": "/api/**",
        "headers": [
          { "key": "Access-Control-Allow-Origin", "value": "${origins[0]}" },
          { "key": "Vary", "value": "Origin" },
          { "key": "Access-Control-Allow-Methods", "value": "GET, POST, PUT, DELETE, OPTIONS" },
          { "key": "Access-Control-Allow-Headers", "value": "Content-Type, Authorization" },
          { "key": "Access-Control-Allow-Credentials", "value": "true" }
        ]
      }
    ]
  }
}

// ─── Option 2: Cloud Functions (dynamic, multiple origins) ───
// functions/index.js
const functions = require("firebase-functions");

const allowedOrigins = ${JSON.stringify(origins)};

exports.api = functions.https.onRequest((req, res) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Credentials", "true");
  }

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.set("Access-Control-Max-Age", "86400");
    res.status(204).send("");
    return;
  }

  // ... your handler
});`;
}

function awsFix(origins) {
  return `// ─── Option 1: API Gateway (Console / CloudFormation) ───
// In API Gateway > Resource > Enable CORS, replace * with specific origins.
// CloudFormation / SAM template:
//
// Resources:
//   MyApi:
//     Type: AWS::Serverless::Api
//     Properties:
//       Cors:
//         AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
//         AllowHeaders: "'Content-Type,Authorization'"
//         AllowOrigin: "'${origins[0]}'"
//         AllowCredentials: true

// ─── Option 2: Lambda (handle CORS in code) ───
// Works with API Gateway, Lambda Function URLs, or ALB.

const allowedOrigins = new Set(${JSON.stringify(origins)});

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin;

  const corsHeaders = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    corsHeaders["Access-Control-Allow-Origin"] = origin;
    corsHeaders["Access-Control-Allow-Credentials"] = "true";
  }

  // Handle preflight
  if (event.requestContext?.http?.method === "OPTIONS" || event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Hello" }),
  };
};

// ─── Option 3: S3 Bucket CORS (for static assets) ───
// aws s3api put-bucket-cors --bucket YOUR_BUCKET --cors-configuration:
${JSON.stringify({
  CORSRules: [{
    AllowedOrigins: origins,
    AllowedMethods: ["GET", "HEAD"],
    AllowedHeaders: ["*"],
    MaxAgeSeconds: 86400,
  }]
}, null, 2)}`;
}

function supabaseFix(origins) {
  return `// ─── Supabase Edge Functions ───
// supabase/functions/my-function/index.ts

const allowedOrigins = new Set(${JSON.stringify(origins)});

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  // ... your logic
  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
});

// ─── PostgREST (Database API) ───
// PostgREST CORS is controlled at the Supabase dashboard level.
// Go to: Settings > API > CORS Allowed Origins
// Replace * with:
${origins.map(o => `//   ${o}`).join("\n")}
//
// IMPORTANT: Also enable Row Level Security (RLS) on all tables.
// CORS alone does NOT protect your data — RLS does.`;
}

function honoFix(origins) {
  return `import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("/api/*", cors({
  origin: ${JSON.stringify(origins)},
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  maxAge: 86400,
}));

// ... your routes
export default app;`;
}

function denoFix(origins) {
  return `// Deno / Deno Deploy — middleware pattern
const allowedOrigins = new Set(${JSON.stringify(origins)});

function withCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get("origin");

    // Handle preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const response = await handler(req);
    const newHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      newHeaders.set(k, v);
    }

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  };
}

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };

  if (origin && allowedOrigins.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

// Usage:
Deno.serve(withCors((req) => {
  return new Response("Hello");
}));`;
}

function laravelFix(origins) {
  const phpArray = origins.map(o => `        '${o}',`).join("\n");
  return `// config/cors.php
// Laravel includes CORS support via fruitcake/laravel-cors (or built-in since v9)

return [
    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

    'allowed_origins' => [
${phpArray}
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Content-Type', 'Authorization', 'X-Requested-With'],

    'exposed_headers' => [],

    'max_age' => 86400,

    'supports_credentials' => true,
];

// Make sure the CORS middleware is registered in app/Http/Kernel.php:
// protected $middleware = [
//     \\Illuminate\\Http\\Middleware\\HandleCors::class,
//     ...
// ];`;
}

function apacheFix(origins) {
  const conditions = origins.map(o =>
    `    SetEnvIf Origin "^${o.replace(/\./g, "\\\\.")}$" CORS_ORIGIN=$0`
  ).join("\n");
  return `# .htaccess or httpd.conf
<IfModule mod_headers.c>
    # Match allowed origins exactly
${conditions}

    Header set Access-Control-Allow-Origin  %{CORS_ORIGIN}e env=CORS_ORIGIN
    Header set Vary                         "Origin"
    Header set Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
    Header set Access-Control-Allow-Headers "Content-Type, Authorization"
    Header set Access-Control-Allow-Credentials "true"

    # Handle preflight
    RewriteEngine On
    RewriteCond %{REQUEST_METHOD} OPTIONS
    RewriteRule ^(.*)$ $1 [R=204,L]
</IfModule>`;
}

function springFix(origins) {
  const originList = origins.map(o => `            "${o}"`).join(",\n");
  return `// Java — WebMvcConfigurer
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.*;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
            .allowedOrigins(
${originList}
            )
            .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .allowedHeaders("Content-Type", "Authorization")
            .allowCredentials(true)
            .maxAge(86400);
    }
}

// Or per-controller:
// @CrossOrigin(origins = {${origins.map(o => `"${o}"`).join(", ")}})`;
}

function goFix(origins) {
  const originMap = origins.map(o => `\t"${o}": true,`).join("\n");
  return `package main

// corsMiddleware wraps an http.Handler with CORS logic.
func corsMiddleware(next http.Handler) http.Handler {
\tallowedOrigins := map[string]bool{
${originMap}
\t}

\treturn http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
\t\torigin := r.Header.Get("Origin")

\t\tif allowedOrigins[origin] {
\t\t\tw.Header().Set("Access-Control-Allow-Origin", origin)
\t\t\tw.Header().Set("Vary", "Origin")
\t\t\tw.Header().Set("Access-Control-Allow-Credentials", "true")
\t\t}

\t\tif r.Method == http.MethodOptions {
\t\t\tw.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
\t\t\tw.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
\t\t\tw.Header().Set("Access-Control-Max-Age", "86400")
\t\t\tw.WriteHeader(http.StatusNoContent)
\t\t\treturn
\t\t}

\t\tnext.ServeHTTP(w, r)
\t})
}

// Usage:
// http.ListenAndServe(":8080", corsMiddleware(yourRouter))`;
}

function dotnetFix(origins) {
  const originList = origins.map(o => `            "${o}"`).join(",\n");
  return `// Program.cs (ASP.NET Core 6+)
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowSpecificOrigins", policy =>
    {
        policy.WithOrigins(
${originList}
        )
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});

var app = builder.Build();

app.UseCors("AllowSpecificOrigins");

// ... rest of pipeline`;
}
