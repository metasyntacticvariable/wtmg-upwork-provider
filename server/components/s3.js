'use strict';

const S3 = require('aws-sdk/clients/s3');
const Promise = require('bluebird');
var config = require('../lib/config');
var _ = require('lodash');

var bucketType = "destination" // destination | source
_.assign(config.aws, { params: config.s3[bucketType] });

var s3 = new S3(config.aws);

function fetchBucket(params) {
  return new Promise(function (resolve, reject) {
    console.log('Fetching bucket... params:', params);
    s3.listObjectsV2(params, function (err, data) {
      if (!err) return resolve(data); 
      return reject(new Error(err));
    });
  });
}

function getObject(params) {
  return new Promise(function (resolve, reject) {
    s3.getObject(params, function (err, data) {
      if (!err) return resolve(data);
      return reject(err);
    });
  });
}

function listObjects(params) {
  return new Promise(function (resolve, reject) {
    s3.listObjectsV2(params, function (err, data) {
      if (!err) return resolve(data);
      return reject(err);
    });
  });
}



function deleteObject(params) {
  return new Promise(function (resolve, reject) {
    s3.deleteObject(params, function (err, data) {
      if (!err) return resolve(data);
      return reject(err);
    });
  });
}


function pushPayload(name, payload) {
  return new Promise(function (resolve, reject) {
    let params = {
      Body: JSON.stringify(payload),
      Key: name
    };
    s3.putObject(params, function (err, data) {
      console.log('Saving payload: ', name, err, data);
      if (!err) return resolve(data);
      return reject(new Error(err));
    });
  });
}


module.exports = {
  fetchBucket: fetchBucket,
  pushPayload: pushPayload,
  getObject: getObject,
  deleteObject: deleteObject,
  listObjects: listObjects
};
