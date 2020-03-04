import AWS from 'aws-sdk'

const albumBucketName = 'mbutler'
const bucketRegion = 'us-east-1'
const identityPoolId = 'us-east-1:6241328d-dbef-44f5-8398-6816d9511825'

AWS.config.update({
    region: bucketRegion,
    credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: identityPoolId
    })
})

export const s3 = new AWS.S3({
    apiVersion: "2006-03-01",
    params: {
        Bucket: albumBucketName
    }
})