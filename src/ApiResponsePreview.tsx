export default function ApiResponsePreview({
  title,
  description,
  category,
  sourceLabel,
}: {
  title: string;
  description: string;
  category: string;
  sourceLabel: string | null;
}) {
  return (
    <div className="data-source-preview">
      <div className="data-source-preview__figure">
        <article className="data-source-preview__card">
          <strong>{title || "Untitled Asset"}</strong>
          <p>{description || "Add a description for your component."}</p>
          <span>{category || "General"}</span>
        </article>
        <div className="data-source-preview__connection" aria-label="Selected data source">
          <i aria-hidden="true" />
          <span className={!sourceLabel ? "is-empty" : undefined}>{sourceLabel ?? "Select source"}</span>
        </div>
      </div>
    </div>
  );
}
