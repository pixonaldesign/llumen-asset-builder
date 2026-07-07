import { getVisualIcon } from "./visualIcons";
import { getChartVisualSrc, isChartVisualAsset } from "./chartVisualAssets";
import { getMapVisualSrc, isMapVisualAsset } from "./mapVisualAssets";

type Props = {
  visualId: string;
  category: "chart" | "map-layer";
  size?: "card" | "bar" | "preview" | "map";
};

export default function VisualArtwork({ visualId, category, size = "card" }: Props) {
  const src =
    category === "chart"
      ? getChartVisualSrc(visualId)
      : category === "map-layer"
        ? getMapVisualSrc(visualId)
        : undefined;

  if (src) {
    return (
      <img
        className={"visual-artwork visual-artwork--" + size}
        src={src}
        alt=""
        draggable={false}
      />
    );
  }

  if (!isChartVisualAsset(visualId) && !isMapVisualAsset(visualId)) {
    const Icon = getVisualIcon(visualId);
    const iconSize = size === "bar" ? 22 : size === "preview" ? 64 : size === "map" ? 48 : 24;
    return (
      <span className={"visual-artwork visual-artwork--phosphor visual-artwork--" + size} aria-hidden="true">
        <Icon size={iconSize} weight="regular" />
      </span>
    );
  }

  return null;
}
