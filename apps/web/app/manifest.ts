import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Epilove",
    short_name: "Epilove",
    description: "Rencontres et amitiés entre étudiantes et étudiants vérifiés du campus.",
    lang: "fr",
    start_url: "/",
    display: "standalone",
    background_color: "#100e18",
    theme_color: "#100e18",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
