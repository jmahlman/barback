import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Barback",
    short_name: "Barback",
    description:
      "Your home bar, organised. Track what you have, keep your recipes, and find out what you can make tonight.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0a0c",
    theme_color: "#0b0a0c",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
