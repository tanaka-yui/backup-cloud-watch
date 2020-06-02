import * as AWS from 'aws-sdk'
import * as CloudWatchLogs from 'aws-sdk/clients/cloudwatchlogs'
import * as S3 from 'aws-sdk/clients/s3'
import * as moment from 'moment'
import * as path from 'path'

import { DateFormat, formatDatetime, getBetweenDatetime, Period } from '../utils/datetimeUtils'

const cloudWatchLogs = new AWS.CloudWatchLogs({ region: 'ap-northeast-1' })
const s3 = new AWS.S3({ region: 'ap-northeast-1' })

export const exec = async (
  bucketName: string,
  logGroupName: string,
  destinationPrefix: string,
  targetDate: string,
  period: Period
) => {
  const betweenDate = getBetweenDatetime(targetDate, period)

  const year = formatDatetime(betweenDate.from, DateFormat.YEAR)
  const date = formatDatetime(betweenDate.from, DateFormat.RFC3339)

  const params: CloudWatchLogs.Types.CreateExportTaskRequest = {
    destination: bucketName,
    from: moment(betweenDate.from).utc()
      .toDate()
      .getTime(),
    to: moment(betweenDate.to).utc()
      .toDate()
      .getTime(),
    logGroupName: logGroupName,
    destinationPrefix: `${destinationPrefix}/${year}`,
    taskName: `${logGroupName}-${date}`
  }
  const fromDate = formatDatetime(betweenDate.from, DateFormat.DATE)
  const toDate = formatDatetime(betweenDate.to, DateFormat.DATE)
  console.log(`-------- [START] CreateExportTask: taskName:${params.taskName} --------`)
  console.log(`bucketName: ${bucketName}`)
  console.log(`logGroupName: ${logGroupName}`)
  console.log(`destinationPrefix: ${destinationPrefix}`)
  console.log(`period: ${period}`)
  console.log(`from: ${fromDate}`)
  console.log(`to:  ${toDate}`)

  try {
    const res = await cloudWatchLogs.createExportTask(params).promise()
    await waitComplete(res.taskId)
    await renameLogs(bucketName, params.destinationPrefix, fromDate, toDate, res.taskId)
    console.log(`-------- [END] CreateExportTask: taskName:${params.taskName} --------`)
  } catch (e) {
    console.error(e, e.stack)
  }
}

const waitComplete = async (taskId: string) => {
  console.log(`WAIT taskId: ${taskId}`)

  const params: CloudWatchLogs.Types.DescribeExportTasksRequest = {
    taskId
  }

  let interval
  await new Promise(resolve => {
    interval = setInterval(async () => {
      const res = await cloudWatchLogs.describeExportTasks(params).promise()
      if (res.exportTasks.length && res.exportTasks.length === 1) {
        switch (res.exportTasks[0].status.code) {
          case 'FAILED':
            console.log(`FAILED taskId: ${taskId}`)
            resolve()
            clearInterval(interval)
            break
          case 'PENDING_CANCEL':
            console.log(`PENDING_CANCEL taskId: ${taskId}`)
            resolve()
            clearInterval(interval)
            break
          case 'PENDING':
            console.log(`PENDING taskId: ${taskId}`)
            break
          case 'RUNNING':
            console.log(`RUNNING taskId: ${taskId}`)
            break
          case 'COMPLETED': {
            console.log(`COMPLETED taskId: ${taskId}`)
            resolve()
            clearInterval(interval)
            break
          }
        }
      }
    }, 5000)
  })
}

const renameLogs = async (bucket: string, destinationPrefix: string, from: string, to: string, taskId: string) => {
  try {
    const params: S3.Types.ListObjectsRequest = {
      Bucket: bucket,
      Prefix: `${destinationPrefix}/${taskId}`
    }
    const res = await s3.listObjects(params).promise()

    let idx = 1
    for (const content of res.Contents) {
      const oldKey = content.Key
      const ext = path.extname(oldKey)
      const copyParams: S3.Types.CopyObjectRequest = {
        CopySource: `${bucket}/${oldKey}`,
        Bucket: bucket,
        Key: `${destinationPrefix}/${from}_${to}-${idx}${ext}`
      }
      await s3.copyObject(copyParams).promise()

      const deleteParams: S3.Types.DeleteObjectRequest = {
        Bucket: bucket,
        Key: oldKey
      }
      await s3.deleteObject(deleteParams).promise()
      idx++
    }
  } catch (e) {
    console.log(e, e.stack)
  }
}
