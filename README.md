# Upwork Provider

Feature list:

 * Github Integration
 * Time tracking Reports

# Environment variables

| Variable | Description |
| ------ | ------ |
| REGION | AWS Region |
| KEYID | AWS KMS Key ID |
| PERIOD_FROM | Time reports window start date  |
| PERIOD_TO | Time reports window end date |
| S3_SOURCE_PREFIX | S3 Source file path prefix |
| S3_SOURCE_BUCKET | S3 Source file bucket |
| S3_DESTINATION_PREFIX | S3 normalized file path prefix |
| S3_DESTINATION_BUCKET | S3 bucket to upload normalized data |
| ES_INDEX | Elasticsearch Index|
| ES_TYPE | Elasticsearch document type |
| ES_HOST | Elasticsearch Host/URI |
| ES_USER | Elasticsearch user|
| ES_PASSWORD | Elasticsearch Password |
| ES_ENABLE | Enable direct ingestion to elastic search , should be true by default|
| ES_DELETE | Clear index before ingestion, should be false by default|
| API_URL | Metering API url |
| API_SECRET | Metering API Secret |
| NODE_ENV | Node Environment |
