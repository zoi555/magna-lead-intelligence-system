# Vercel Setup — Magna Lead Intelligence System

Vercel is only needed once the internal dashboard exists.

## Rule

No production deployment until UAT pipeline and RLS are verified.

## Environment variables

Use Vercel env vars for public/client-safe keys only where appropriate. Server-only keys must never be exposed client-side.
