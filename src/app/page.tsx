import { Support } from "@/components/support";
import { customers } from "@/data/seed";

export default function Home() {
  return <Support customers={customers} />;
}
