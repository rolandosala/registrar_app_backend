import express from 'express'
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise'

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createPool({
    host: process.env.DB_HOST /* 'localhost' */,
    user: process.env.DB_USERNAME /* 'root' */,
    password: process.env.DB_PASSWORD /* '' */,
    database: process.env.DB_NAME/* 'studentrecord_db' */,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
})


// GET OR FETCH API FUNCTION

app.get('/fetchTransferedOutBySchool', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT COUNT(*) AS count, schoolname
            FROM transferred_out_tbl
            WHERE transfer_status = 2
            GROUP BY schoolname
            ORDER BY count DESC;
        `);
        res.json(rows); // Only sending the result rows
    } catch (err) {
        console.error('Error fetching transferred out data:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/fetchTransferedOutByCourse', async (req, res) => {
    try {
        const [rows] = await db.query(`
           SELECT COUNT(*) AS count, course, major 
           FROM transferred_out_tbl 
           WHERE transfer_status = 2 
           GROUP BY course 
           ORDER BY count DESC;
        `);
        res.json(rows); // Only sending the result rows
    } catch (err) {
        console.error('Error fetching transferred out data:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/fetchWalkinRequestData', async (req, res) => {
    try {
        const [rows] = await db.query(`
           SELECT * FROM request_tbl ORDER BY date_requested DESC`);
        res.json(rows); // Only sending the result rows
    } catch (error) {
        console.log(error);
    }
})

app.get('/fetchStudentRecordData', async (req, res) => {
    try {
        const [rows] = await db.query(`
           SELECT studentid, lastname, firstname, middlename, course, major 
           FROM admission_tbl 
           INNER JOIN personalbackground_tbl 
           ON personalbackground_tbl.studentid = admission_tbl.student_id 
           ORDER BY lastname ASC;`);
        res.json(rows); // Only sending the result rows
    } catch (error) {
        console.log('Fetching Student Record Error: ', error)
    }
})

app.get('/fetchComplianceRecordData', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM inc_transaction_tbl`);
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})

app.get('/fetchShifteeRecordData', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM shiftee_tbl`);
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})

app.get('/fetchNSTPSerialNumber', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM nstp_tbl`)
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})

app.get('/fetchTransferredOutRecordData', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM transferred_out_tbl ORDER BY lastname ASC`)
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})

app.get(`/fetchStudentDetailedInformation`, async (req, res) => {
    try {
        const { id } = req.query
        const [rows] = await db.query(`
            SELECT * 
            FROM personalbackground_tbl 
            JOIN admission_tbl ON personalbackground_tbl.studentid = admission_tbl.student_id 
            JOIN educationalbackground_tbl ON admission_tbl.student_id = educationalbackground_tbl.studentid 
            WHERE personalbackground_tbl.studentid = ?;`, [id])
        res.json(rows);
    } catch (error) {
        console.log(error);
    }
})

app.get(`/fetchStudentSemestersEnrolled`, async (req, res) => {
    try {
        const { id } = req.query
        const [rows] = await db.query(`
            SELECT semester,academicyear, course, major 
            FROM subjectstaken_tbl 
            WHERE studentid = ?
            GROUP BY academicyear, semester ORDER BY academicyear ASC;`, [id])
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})

app.get(`/fetchStudentSemestralRatingRecords`, async (req, res) => {
    try {
        const { id } = req.query
        const [rows] = await db.query(`
            SELECT * FROM subjectstaken_tbl WHERE studentid = ? ORDER BY academicyear ASC`, [id])
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})

app.get('/fetchCoursesRecord', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT course_id, course_name FROM courses_tbl`)
        res.json(rows)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Fetching Courses Record', error: error.message })
    }
})

app.get('/fetchMajorsRecord', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT major_id, major_name FROM majors_tbl`)
        res.json(rows)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Fetching Courses Record', error: error.message })
    }
})

function countOccurrences(array, key) {
    const counts = {}
    array.forEach(row => {
        const raw = row[key] ?? ''
        const items = raw.split(',').map(item => item.trim()).filter(Boolean)
        items.forEach(item => {
            counts[item] = (counts[item] || 0) + 1
        })
    })
    return counts
}
app.get('/fetchRequestReportsByTransaction', async (req, res) => {
    try {
        const { startdate, enddate, status } = req.query
        const [rows] = await db.query(`SELECT requests, purpose 
            FROM request_tbl 
            WHERE date_requested BETWEEN ? AND ? AND status = ?;`, [startdate, enddate, status])
        const requestCounts = countOccurrences(rows, 'requests')
        const purposeCounts = countOccurrences(rows, 'purpose')
        res.json({
            requestCounts: Object.entries(requestCounts).map(([name, count]) => ({ name, count })),
            purposeCounts: Object.entries(purposeCounts).map(([name, count]) => ({ name, count }))
        })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Fetching Request Reports by Transaction', error: error.message })
    }
})

app.get('/fetchTORTransactions', async (req, res) => {
    try {
        const { id } = req.query
        const [rows] = await db.query(`
           SELECT dateissued,remarks,ornumber,docstamp FROM tortransactions_tbl WHERE studentid = ?;`, [id])
        res.json(rows)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Fetching Courses Record', error: error.message })
    }
})

// POST OR CREATE API FUNCTIONS
app.post('/createNewRequest', async (req, res) => {
    try {
        const { request_date, fullname, course, major, contact, email, requests, purpose, status } = req.body
        const requestsStr = Array.isArray(requests) ? requests.join(', ') : requests;
        const purposeStr = Array.isArray(purpose) ? purpose.join(', ') : purpose;
        const [rows] = await db.query(`INSERT INTO request_tbl (date_requested, name, course, major, contact, email, requests, purpose, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`, [request_date, fullname, course, major, contact, email, requestsStr, purposeStr, status])
        res.json({ message: 'Request Saved' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Creating Request: ', error: error.message })
    }
})

// PUT OR UPDATE API FUNCTIONS
app.put('/updateRequestToPaid', async (req, res) => {
    try {
        const { status, ornumber, ordate, docstamp, docstampdate, id } = req.body
        const [rows] = await db.query(`UPDATE request_tbl SET status = ?, or_number = ?, or_date = ?, docstamp = ?, docstamp_date = ? WHERE request_tbl.id = ?;`, [status, ornumber, ordate, docstamp, docstampdate, id])
        res.json({ message: 'Request Paid' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error on Updating Request to Paid: ', error: error.message })
    }
})
app.put('/updateRequestToReleased', async (req, res) => {
    try {
        const { status, datereleased, receiver, receivername, documentpresented, id } = req.body
        const [rows] = await db.query(`
            UPDATE request_tbl 
            SET status = ?, date_released = ?, receiver = ?, receiver_name = ?, document_presented = ? 
            WHERE request_tbl.id = ?;`, [status, datereleased, receiver, receivername, documentpresented, id])
        res.json({ message: 'Request Released' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error on Updating Request to Released: ', error: error.message })
    }
})
app.put('/updateRequestToFiledOrMailing', async (req, res) => {
    try {
        const { status, datefiled, id } = req.body
        const [rows] = await db.query(`
            UPDATE request_tbl 
            SET status = ?, date_filed = ? 
            WHERE request_tbl.id = ?;`, [status, datefiled, id])
        res.json({ message: 'Request Updated to Filed' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error on Updating Request to Filed: ', error: error.message })
    }
})
app.put('/updateRequestToMailed', async (req, res) => {
    try {
        const { status, datemailed, receiver, id } = req.body
        const [rows] = await db.query(`
           UPDATE request_tbl SET status = ?, date_mailed = ?, receiver = ?
           WHERE request_tbl.id = ?`, [status, datemailed, receiver, id])
        res.json(rows)
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error on Updating Request to Mailed: ', error: error.message })
    }
})
app.put('/updateRequestNotice', async (req, res) => {
    try {
        const { notes, id } = req.body
        const [rows] = await db.query(`
           UPDATE request_tbl SET notes = ?
           WHERE request_tbl.id = ?`, [notes, id])
        res.json({ message: 'Notice Added' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error on Updating Request Notes: ', error: error.message })
    }
})
app.put('/updateAdmissionRecord', async (req, res) => {
    try {
        const { admission_date, entrance_credentials, course, major, studentid } = req.body
        const [rows] = await db.query(`
            UPDATE admission_tbl 
            SET admission_date = ?, entrance_credential = ?, course = ?, major = ?
            WHERE student_id = ?;`, [admission_date, entrance_credentials, course, major, studentid])
        res.json({ message: 'Admission Record Updated' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Updating Admission Record: ', error: error.message })
    }
})
app.put('/updatePersonalBackgroundRecord', async (req, res) => {
    try {
        const { lastname, firstname, middlename, birthdate, birthplace, gender, citizenship, religion, parent, address, studentid } = req.body
        const [rows] = await db.query(`
            UPDATE personalbackground_tbl SET lastname = ?,firstname = ?, middlename = ?, birthdate = ?, birthplace = ?, sex = ?, citizenship = ?, religion = ?, parentguardian = ?, permanentaddress = ? WHERE personalbackground_tbl.studentid = ?;`, [lastname, firstname, middlename, birthdate, birthplace, gender, citizenship, religion, parent, address, studentid])
        res.json({ message: 'Personal Background Record Updated' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Updating Admission Record: ', error: error.message })
    }
})
app.put('/updateEducationalBackground', async (req, res) => {
    try {
        const { elementaryschoolname, elementaryschooladdress, elementaryyeargraduated,
            secondaryschoolname, secondaryschooladdress, secondaryyeargraduated,
            tertiaryschoolname, tertiaryschooladdress, tertiaryyeargraduated, studentid
        } = req.body
        const [rows] = await db.query(`
            UPDATE educationalbackground_tbl SET 
            elementaryschool = ?, elementaryaddress = ?, elementaryyeargraduated = ?, 
            secondaryschool = ?, secondaryaddress = ?, secondaryyeargraduated = ?, 
            tertiaryschool = ?, tertiaryaddress = ?, tertiaryyeargraduated = ? 
            WHERE educationalbackground_tbl.studentid = ?;`, [
            elementaryschoolname, elementaryschooladdress, elementaryyeargraduated,
            secondaryschoolname, secondaryschooladdress, secondaryyeargraduated,
            tertiaryschoolname, tertiaryschooladdress, tertiaryyeargraduated, studentid])
        res.json({ message: 'Educational Background Record Updated' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Updating Admission Record: ', error: error.message })
    }
})
app.put('/updateSemestralRating', async (req, res) => {
    try {
        const { courseno, title, grade, reex, credit, id } = req.body
        console.log(courseno, title, grade, reex, credit, id)
        const [rows] = await db.query(`
            UPDATE subjectstaken_tbl SET 
            coursenumber = ?, descriptivetitle = ?, finalgrade = ?, reex = ?, credit = ? 
            WHERE subjectstaken_tbl.id = ?;`, [courseno, title, grade, reex, credit, id])
        res.json({ message: 'Record Updated' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Updating Admission Record: ', error: error.message })
    }
})

//DELETE FUNCTIONS
app.delete('/deletePendingRequest', async (req, res) => {
    try {
        const { id } = req.query
        const [rows] = await db.query(`
            DELETE FROM request_tbl WHERE id = ? `, [id])
        res.json({ message: 'Request Deleted' })
    } catch (error) {
        console.log(error)
    }
})

app.listen(process.env.DB_PORT/* 3002 */, () => {
    console.log(`Server is running on localhost:${process.env.DB_PORT/* 3002 */}`)
})