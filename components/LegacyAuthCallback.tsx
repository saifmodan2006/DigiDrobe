"use client";
import { useEffect } from "react";

export default function LegacyAuthCallback() {
  useEffect(() => {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const query = new URLSearchParams(location.search);
    if (
      fragment.has("access_token") ||
      fragment.has("error_code") ||
      query.has("recovery")
    ) {
      location.replace("/account" + location.search + location.hash);
    }
  }, []);
  return null;
}
