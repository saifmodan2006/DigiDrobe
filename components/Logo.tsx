import Image from "next/image";
import mark from "../app/icon.svg";
import { brand } from "../lib/config";
export default function Logo() {
  return (
    <span className="logo">
      <Image src={mark} alt="" width={34} height={34} />
      {brand.name}
    </span>
  );
}
