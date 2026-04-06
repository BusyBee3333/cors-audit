/**
 * Fix generators — given a list of allowed origins, output platform-specific
 * CORS configuration that replaces the wildcard.
 */

const PLATFORMS = {
  vercel: "Vercel (vercel.json)",
  express: "Express (cors middleware)",
  nextjs: "Next.js (next.config.js)",
  nginx: "Nginx",
  cloudflare: "Cloudflare Workers",
  fastify: "Fastify",
  netlify: "Netlify (_headers / netlify.toml)",
  flask: "Flask (flask-cors)",
  django: "Django (django-cors-headers)",
  rails: "Rails (rack-cors)",
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
    vercel: () => vercelFix(normalized),
    express: () => expressFix(normalized),
    nextjs: () => nextjsFix(normalized),
    nginx: () => nginxFix(normalized),
    cloudflare: () => cloudflareFix(normalized),
    fastify: () => fastifyFix(normalized),
    netlify: () => netlifyFix(normalized),
    flask: () => flaskFix(normalized),
    django: () => djangoFix(normalized),
    rails: () => railsFix(normalized),
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
