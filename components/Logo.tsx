import { Layers2 } from "lucide-react";
import { brand } from "../lib/config";
export default function Logo() {
  return (
    <span className="logo">
      <Layers2 aria-hidden="true" />
      {brand.name}
    </span>
  );
}
