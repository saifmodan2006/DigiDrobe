import type { Metadata } from "next";
import Studio from "../../../components/Studio";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create a DigiDrobe account to organize your clothes and save outfits.",
};

export default function CreateAccountPage() {
  return <Studio initialMode="signup" />;
}
