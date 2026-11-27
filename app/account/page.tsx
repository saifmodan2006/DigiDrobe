import type { Metadata } from "next";
import Studio from "../../components/Studio";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your private DigiDrobe wardrobe.",
};

export default function AccountPage() {
  return <Studio />;
}
