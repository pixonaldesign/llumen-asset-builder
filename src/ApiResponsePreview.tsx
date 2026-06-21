const SAMPLE_RESPONSE = `{
  "location": "New York",
  "temperature": 22.5,
  "humidity": 65,
  "description": "Partly cloudy",
  "wind_speed": 12.3,
  "timestamp": "2024-01-15T14:30:00Z"
}`;

export default function ApiResponsePreview() {
  return (
    <div className="api-response">
      <div className="api-response__head">
        <h3 className="api-response__title">Response</h3>
        <dl className="api-response__meta">
          <div className="api-response__meta-item">
            <dt>Status</dt>
            <dd className="api-response__status">200 OK</dd>
          </div>
          <div className="api-response__meta-item">
            <dt>Time</dt>
            <dd>245ms</dd>
          </div>
          <div className="api-response__meta-item">
            <dt>Size</dt>
            <dd>1.2 KB</dd>
          </div>
        </dl>
      </div>
      <pre className="api-response__body">
        <code>{SAMPLE_RESPONSE}</code>
      </pre>
    </div>
  );
}
