import dynamic from "next/dynamic";

const ActivityPageClient = dynamic(() => import("./ActivityPageClient"), {
  ssr: false,
});

export default ActivityPageClient;
