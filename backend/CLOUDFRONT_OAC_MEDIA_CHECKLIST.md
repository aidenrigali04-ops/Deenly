# CloudFront OAC Media Delivery Checklist

Use this checklist to keep the S3 bucket private while serving user media through CloudFront.

## 1) Inputs You Need

- AWS account ID: `950165721651`
- S3 bucket: `deenly-media-prod-950165721651-us-east-2-an`
- Region: `us-east-2`
- CloudFront distribution ID and domain name

## 2) Create/Confirm CloudFront Distribution

- Origin domain uses the S3 bucket origin (not public website endpoint).
- Origin Access Control (OAC) is attached to the origin.
- Viewer protocol policy is `Redirect HTTP to HTTPS` (or `HTTPS only`).
- Allowed methods include at least `GET, HEAD`.
- Caching/compression are enabled for static media delivery.

## 3) Bucket Policy for Private Read via CloudFront

Replace `<ACCOUNT_ID>` and `<DISTRIBUTION_ID>` in this policy before applying.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontServicePrincipalReadOnly",
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::deenly-media-prod-950165721651-us-east-2-an/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
        }
      }
    }
  ]
}
```

Common fix for `Policy has invalid resource`:

- Use bucket ARN format exactly as `arn:aws:s3:::<bucket-name>/*`.
- Do not include region/account in S3 ARN.
- Ensure bucket name is exact: `deenly-media-prod-950165721651-us-east-2-an`.

## 4) Backend Environment Wiring

Set backend variables:

- `MEDIA_PROVIDER=s3`
- `AWS_REGION=us-east-2`
- `AWS_S3_BUCKET=deenly-media-prod-950165721651-us-east-2-an`
- `MEDIA_PUBLIC_BASE_URL=https://<your-cloudfront-domain>`

Notes:

- Keep `media_upload_key` as canonical object key in DB.
- Backend normalizes key/key-URL payloads into `MEDIA_PUBLIC_BASE_URL/<key>` for `media_url`.

## 5) Verification

- `POST /media/upload-signature` returns S3 `uploadUrl` and `key`.
- `POST /media/posts/:postId/attach` response includes:
  - `media_upload_key` as S3 object key
  - `media_url` as CloudFront URL
  - `media_mime_type` present
- `GET /feed` and `GET /posts/:id` return resolvable `media_url`.
- Web and mobile feed/detail render image/video without broken media blocks.
