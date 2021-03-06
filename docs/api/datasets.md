## GET /datasets/

returns a Map/Hash/Object keyed with string authors, and each value is an array of dataset names that author has created.

## GET /datasets/author:

returns an array of dataset names this author owns

```json
[
  "dataset-1",
  "dataset-2"
]
```

## GET /datasets/author:dataset-name/

returns an object with dataset configuration, and a list of records in the dataset and their versions.

```js
{
  "author": "author-profile-name"
  "name": "dataset-name",
  "version": 8,
  "config": { "memo": "Free text describing the dataset" },
  "records": {
    "name-of-record": { "version": 1, "hash": Buffer, "links": [] },
    "name-of-record-2": { "version": 8, "hash": Buffer, "links": [] },
  }
}
```

## GET /datasets/author:dataset-name/records/

returns a Map/Hash/Object with string keys (recordIDs) and object values `{ version: "123" }`. `version` is a string which maybe a hash, an integer number, or something else. Compatible clients shouldn't try to parse it or manipulate it. Response also includes an `X-Version` header containing the current version of the dataset. This number might not match any version value of any particular record, if the most recent change to the dataset was deleting some records.

```json
{
  "recordA": { "version": 6, "hash": Buffer, "links": []  },
  "recordB": { "version": 7, "hash": Buffer, "links": []  }
}
```

## POST /datasets/author:dataset-name/records/

POST body must be a Map/Hash/Object with recordID string keys, and any values. `undefined` or `null` values will cause that record to be deleted in the underlying dataset, if it exists. Any other values will be stored as the record's value, overwriting or creating records as needed. Any recordIDs that are not present in the body map will be left as is and inherited in the new version.

## PUT /datasets/author:dataset-name/records/

PUT body must be in the same format as the POST verb, but any unspecified recordIDs will be deleted, not inherited from previous versions.

## DELETE /datasets/author:dataset-name/

Delete the entire dataset. Including all versions.

## GET /datasets/author:dataset-name/records/recordID

returns the value of the record, as an arbitrary object, and the X-Version header specifying it's current version number.

## GET /datasets/author:dataset-name/as/format/recordID/

Format may be one of json, cbor, msgpack, yaml, xml, html, jsonl, or a suitably encoded mime type for any of these formats. If a record contains a string or a buffer as it's root object, format maybe any mime type or file extension string, and the server will attempt to serve the content directly.

Note, sandbox http headers will generally prevent scripts from executing in resources directly loaded from this interface. This might impact html and svgs.

## PUT /datasets/author:dataset-name/records/recordID

A new version of the dataset is created, changing the value of this record to whatever object is provided as the POST body.

## DELETE /datasets/author:dataset-name/records/recordID

A new version of the dataset is created, removing this recordID from the collection.

## A note on attachments

Dataset records can contain file attachments. Attachments are referred to using (https://github.com/hash-uri/hash-uri)[Hash URI Scheme]. Pigeon Optics currently always uses sha256, hex encoded, so documents containing a string beginning with `hash://sha256/9f86d081884c7d659a2feaa0?type=mime/type` where the hex hash value and the mime type query string may change, will be recognised and will retain attachments with that hash in the attachment store. When uploading a document to Pigeon Optics which contains this URL scheme, the server will verify if it has the hashed data available already. If any attachments aren't available on the server, it will respond with `400 Bad Request` and the extra http header `X-Pigeon-Optics-Resend-With-Attachments`. In this case, nothing has been saved server side, the request is totally rejected and should be reattempted. The `X-Pigeon-Optics-Resend-With-Attachments` header will have a comma seperated list of json encoded strings containing the URL references that are missing. This header's value can always be parsed as `JSON.parse('[' + headerValue + ']')`.

To reattempt the request including required attachments, a `multipart/form-data` body should be constructed, containing all of the attachments with field name `'attachment'` or `'file'`. Only the data of the attachment will be considered. The server will hash it during upload and store it when it stores the document successfully. In multipart/form-data requests, the body should also be a file attachment with field name `'body'` and a valid supported Content-Type. If body is omitted, any included form-data fields will be formed in to a plain object and treated as the body, with string values. Body must also have a filename set, though it can be any name, as this makes it a "file" attachment rather than a form text field.

For convenience, applications that cannot or do not wish to hash the content of their attachments may instead use `cid:` URLs to link to attachments in uploaded documents. This takes the form of `cid:content-id` or `cid:filename` where `content-id` is the exact string value of a Content-ID header in the form-data entry headers, and `filename` is the filename string from the `Content-Disposition` form data header.

Including a `Content-ID` header in form-data bodies is technically not compliant with the form-data spec and can be difficult to do with some form-data software, so the filename fallback is provided for compatibility. The strings must exactly match. Documents containing a `cid:` url will be transformed by the server to have hash:// urls in those locations, if such an attachment exists in the upload. cid: urls that don't resolve to an included attachment are left as is.

Uploaded attachments will only be retained by the server while they are referenced by a document in a dataset or lens, under normal circumstances. They can be loaded from the server by finding `hash://sha256/` urls and replacing the prefix with `https://pigeon-optics/mount-path/attachments/`

## A note on lenses

Lenses support this API as well (but at the /lenses/ path) with the GET verb, in exactly the same way. Lenses are not able to be written using any PUT/POST/DELETE verbs, because lens content is always derived from the output of configured javascript map/reduce functions running server side. If you are building a derived dataset outside of Pigeon Optics lenses, you should use the [export.md](export.md) interface's event-stream to watch for changes in underlying datasets, and upload a resulting dataset through this API. A reasonable approach is to watch for changes, and whenever the X-Version of a record changes, reprocess it and upload your response to an output dataset.