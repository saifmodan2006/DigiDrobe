import Image from "next/image";
import { brand } from "../lib/config";
export default function Logo() {
  return (
    <span className="logo">
      <Image
        src="/fabric-d-mark.webp"
        alt=""
        width={76}
        height={76}
        unoptimized
      />
      {brand.name}
    </span>
  );
}
