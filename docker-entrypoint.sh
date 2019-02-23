#!/bin/sh

echo [TIMING `date +"%F %R:%S"`] Task started

WORKDIR="metering-upwork"

# Define the environment specific config file location
CONFIG_FILE=/${WORKDIR}/config/${NODE_ENV}.json
CONFIGURATION=$(cat /${WORKDIR}/config-template.json)

# Formulate the jq filter expression
FILTER=". \
|.aws.region=\$REGION \
|.aws.keyid=\$KEYID \
|.lookup.url=\$API_URL \
|.lookup.secret=\$API_SECRET \
|.s3.destination.prefix=\$S3_DESTINATION_PREFIX \
|.s3.destination.bucket=\$S3_DESTINATION_BUCKET \
|.s3.source.prefix=\$S3_SOURCE_PREFIX \
|.s3.source.bucket=\$S3_SOURCE_BUCKET \
|.es.index=\$ES_INDEX \
|.es.type=\$ES_TYPE \
|.es.host=\$ES_HOST \
|.es.enable=\$ES_ENABLE \
|.es.delete=\$ES_DELETE \
|.es.user=\$ES_USER \
|.es.password=\$ES_PASSWORD \
"
# Now invoke jq to do the work, passing in the expected env variables
echo ${CONFIGURATION} | jq \
--arg REGION "${REGION}" \
--arg KEYID "${KEYID}" \
--arg S3_SOURCE_PREFIX "${S3_SOURCE_PREFIX}" \
--arg S3_SOURCE_BUCKET "${S3_SOURCE_BUCKET}" \
--arg S3_DESTINATION_PREFIX "${S3_DESTINATION_PREFIX}" \
--arg S3_DESTINATION_BUCKET "${S3_DESTINATION_BUCKET}" \
--arg ES_HOST "${ES_HOST}" \
--arg ES_INDEX "${ES_INDEX}" \
--arg ES_TYPE "${ES_TYPE}" \
--arg ES_ENABLE "${ES_ENABLE}" \
--arg ES_DELETE "${ES_DELETE}" \
--arg ES_USER "${ES_USER}" \
--arg ES_PASSWORD "${ES_PASSWORD}" \
--arg PERIOD_FROM "${PERIOD_FROM}" \
--arg PERIOD_TO "${PERIOD_TO}" \
--arg API_URL "${API_URL}" \
--arg API_SECRET "${API_SECRET}" \
"${FILTER}" > ${CONFIG_FILE}

if [[ -n "${GSGEN_DEBUG}" ]]; then
    # Loop until killed
    node /${WORKDIR}/server
    while true; do
        sleep 5
    done
else
    # Replace the startup script with node so it with receive signals as pid 1
    exec "$@"
fi

echo [TIMING `date +"%F %R:%S"`] Task complete

