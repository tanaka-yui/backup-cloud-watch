import * as moment from 'moment'

import {DateFormat, Period} from '../utils/datetimeUtils'
import { exec } from './cloudwatch'

export default async function() {
  const execDate = moment()
    .utc()
    .format(DateFormat.DATE_TIME)
  const bucketName = process.env.BUCKET_NAME
  const logGroups = process.env.LOG_GROUP_NAMES
  for (const name of logGroups.split(',')) {
    await exec(bucketName, name, name, execDate, Period.LAST_WEEK)
  }
}
