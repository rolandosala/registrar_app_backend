import express from 'express'
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise'
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import csv from 'csv-parser';
import wkhtmlToPdf from 'wkhtmltopdf';
import bodyParser from 'body-parser';

dotenv.config();

const app = express();
app.use(cors({
  origin: "http://localhost:3005",   // allow your Vue app
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));


const db = mysql.createPool({
    host: process.env.MYSQL_ADDON_HOST,
    user: process.env.MYSQL_ADDON_USER,
    password: process.env.MYSQL_ADDON_PASSWORD,
    database: process.env.MYSQL_ADDON_DB,
    port: process.env.MYSQL_ADDON_PORT,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
})
const storage = multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    },
});
const upload = multer({ storage });

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
            JOIN otherinformation_tbl ON educationalbackground_tbl.studentid = otherinformation_tbl.studentid 
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
app.get('/fetchSemesters', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT semester FROM inc_transaction_tbl GROUP BY semester;`)
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})
app.get('/fetchAcademicYear', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT academic_year FROM inc_transaction_tbl GROUP BY academic_year;`)
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})
app.get('/fetchCourseandDescriptiveTitle', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT course_no, descriptive_title FROM inc_transaction_tbl GROUP BY course_no;`)
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})
app.get('/fetchInstructors', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT instructor FROM inc_transaction_tbl GROUP BY instructor;`)
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})
app.get('/fetchTransferredInSchoolName', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT schoolname, schooladdress FROM transferred_in_tbl GROUP BY schoolname;`)
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})
app.get('/fetchTransferredOutSchoolName', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT schoolname, schooladdress FROM transferred_out_tbl GROUP BY schoolname;`)
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})
app.get('/fetchStudentNameTransferredOut', async (req, res) => {
    try {
        const { schoolname } = req.query
        const [rows] = await db.query(`
            SELECT lastname, firstname, middlename, course, granted_date
            FROM transferred_out_tbl 
            WHERE schoolname = ?;`, [schoolname])
        res.json(rows)
    } catch (error) {
        console.log(error)
    }
})
app.get('/fetchTransferredInList', async (req, res) => {
    try {
        const [rows] = await db.query(`SELECT * FROM transferred_in_tbl`)
        res.json(rows)
    } catch (error) {
        console.log(error)
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
app.post('/createNewStudentRecord', async (req, res) => {
    const { student_id, admission_date, entrance_credential, course, major, lastname, firstname, middlename, birthdate, birthplace, sex, citizenship, religion, parentguardian, permanentaddress, elementaryschool, elementaryaddress, elementaryyeargraduated, secondaryschool, secondaryaddress, secondaryyeargraduated, tertiaryschool, tertiaryaddress, tertiaryyeargraduated, nstpserialnumber, boardresolution, notes, yeargraduated } = req.body
    const db_connection = await db.getConnection()
    try {
        const admission_data = [student_id, admission_date, entrance_credential, course, major]
        const personal_data = [student_id, lastname, firstname, middlename, birthdate, birthplace, sex, citizenship, religion, parentguardian, permanentaddress]
        const education_data = [student_id, elementaryschool, elementaryaddress, elementaryyeargraduated, secondaryschool, secondaryaddress, secondaryyeargraduated, tertiaryschool, tertiaryaddress, tertiaryyeargraduated]
        const misc_data = [student_id, nstpserialnumber, boardresolution, notes, yeargraduated]

        await db_connection.beginTransaction()
        await db_connection.query(`
            INSERT INTO admission_tbl (student_id, admission_date, entrance_credential, course, major) 
            VALUES (?, ?, ?, ?, ?);`, admission_data)
        await db_connection.query(`
            INSERT INTO personalbackground_tbl (studentid, lastname, firstname, middlename, birthdate, birthplace, sex, citizenship, religion, parentguardian, permanentaddress) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, personal_data)
        await db_connection.query(`
            INSERT INTO 
            educationalbackground_tbl (studentid, elementaryschool, elementaryaddress, elementaryyeargraduated, secondaryschool, secondaryaddress, secondaryyeargraduated, tertiaryschool, tertiaryaddress, tertiaryyeargraduated) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, education_data)
        await db_connection.query(`
            INSERT INTO 
            otherinformation_tbl (studentid, nstpserialnumber, boardresolution, notes, yeargraduated) 
            VALUES (?, ?, ?, ?, ?);`, misc_data)
        await db_connection.commit()
        res.json({ message: 'Student Record Created' })
    } catch (error) {
        await db_connection.rollback()
        res.status(500).json({ message: 'Error Creating Request: ', error: error.message })
    } finally {
        db_connection.release()
    }
})
app.post("/uploadSemetralRatings", upload.single("csvFile"), (req, res) => {
    try {
        const filePath = req.file.path;
        const id = req.body.id;
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => {
                const keys = Object.keys(results[0]); // Get column names
                const placeholders = keys.map(() => '?').join(',');

                const insertQuery = `INSERT INTO subjectstaken_tbl (${keys.join(',')}) VALUES (${placeholders})`;

                results.forEach((row) => {
                    const values = keys.map((key) => row[key]);
                    db.query(insertQuery, values, (err) => {
                        if (err) console.error('Insert error:', err);
                    });
                });

                res.send('CSV uploaded and data inserted!');
            });
    } catch (error) {
        console.error('Error uploading CSV:', error);
        res.status(500).send('Error uploading CSV');
    }
});
app.post('/addNewCompliance', async (req, res) => {
    try {
        const { date, student_id, student_name, course_no, descriptive_title, semester, date_complied, rating, instructor, academic_year, ornumber, datepaid } = req.body
        if (!date || !student_id || !student_name || !course_no || !descriptive_title || !semester || !date_complied || !rating || !instructor || !academic_year || !ornumber || !datepaid) {
            return res.json({ message: 'Empty Field' })
        }
        const [rows] = await db.query(`
            INSERT INTO inc_transaction_tbl 
            (date, student_id, student_name, course_no, descriptive_title, semester, date_complied, rating, instructor, academic_year, ornumber, datepaid) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [date, student_id, student_name, course_no, descriptive_title, semester, date_complied, rating, instructor, academic_year, ornumber, datepaid])
        res.json({ message: 'Compliance Saved' })
    } catch (error) {
        console.log(error)
    }
})
app.post('/addNewTransferIn', async (req, res) => {
    try {
        const { studentid, date, lastname, firstname, middlename, gender, course, major, schoolname, schooladdress } = req.body
        const [rows] = await db.query(`
          INSERT INTO transferred_in_tbl (studentid, date, lastname, firstname, middlename, gender, course, major, schoolname, schooladdress) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,?);`,
            [studentid, date, lastname, firstname, middlename, gender, course, major, schoolname, schooladdress])
        res.json({ message: 'Transfer In Saved' })
    } catch (error) {
        console.log(error)
    }
})
app.post('/addNewTransferOut', async (req, res) => {
    try {
        const { studentid, firstname, lastname, middlename, gender, course, major, grad_status, yeargraduated, lastsemesterattended, academicyear, or_number, or_date, docstamp, docstamp_date, informative_date, transfer_status } = req.body
        const [rows] = await db.query(`
           INSERT INTO transferred_out_tbl (studentid, firstname, lastname, middlename, gender, course, major, grad_status, yeargraduated, lastsemesterattended, academicyear, or_number, or_date, docstamp, docstamp_date, informative_date, transfer_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
            [studentid, firstname, lastname, middlename, gender, course, major, grad_status, yeargraduated, lastsemesterattended, academicyear, or_number, or_date, docstamp, docstamp_date, informative_date, transfer_status])
        res.json({ message: 'Transfer Out Saved' })
    } catch (error) {
        console.log(error)
    }
})
app.post('/addNewShiftee', async (req, res) => {
    try {
        const { studentid, lastname, firstname, middlename, semester, academicyear, currentcourse, currentmajor, newcourse, newmajor, dateadded } = req.body
        const [rows] = await db.query(`
            INSERT INTO shiftee_tbl 
            (studentid, lastname, firstname, middlename, semester, academicyear, currentcourse, currentmajor, newcourse, newmajor, dateadded) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, [studentid, lastname, firstname, middlename, semester, academicyear, currentcourse, currentmajor, newcourse, newmajor, dateadded])
        res.json({ message: 'Shiftee Saved' })
    } catch (error) {
        console.log(error)
    }
})

app.post('/generateCTC', async (req, res) => {
    const { htmlContent } = req.body;
    if (!htmlContent) {
        return res.status(400).json({ error: "HTML content is required" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=generated.pdf");
    wkhtmlToPdf(htmlContent, { pageSize: "A4", enableLocalFileAccess: true, orientation: 'Portrait' }).pipe(res);
})
app.post('/generateGTC', async (req, res) => {
    const { htmlContent } = req.body;
    if (!htmlContent) {
        return res.status(400).json({ error: "HTML content is required" });
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=generated.pdf");
    wkhtmlToPdf(htmlContent, { pageSize: "A4", enableLocalFileAccess: true, orientation: 'Landscape' }).pipe(res);
})

// PUT OR UPDATE API FUNCTIONS
app.put('/updateRequestToPaid', async (req, res) => {
    try {
        const { status, ornumber, ordate, docstamp, docstampdate, id } = req.body
        const [rows] = await db.query(`UPDATE request_tbl SET status = ?, or_number = ?, or_date = ?, docstamp = ?, docstamp_date = ? WHERE request_tbl.id = ?; `, [status, ornumber, ordate, docstamp, docstampdate, id])
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
            WHERE request_tbl.id = ?; `, [status, datereleased, receiver, receivername, documentpresented, id])
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
            WHERE request_tbl.id = ?; `, [status, datefiled, id])
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
            WHERE request_tbl.id = ? `, [status, datemailed, receiver, id])
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
            WHERE request_tbl.id = ? `, [notes, id])
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
            WHERE student_id = ?; `, [admission_date, entrance_credentials, course, major, studentid])
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
            UPDATE personalbackground_tbl SET lastname = ?, firstname = ?, middlename = ?, birthdate = ?, birthplace = ?, sex = ?, citizenship = ?, religion = ?, parentguardian = ?, permanentaddress = ? WHERE personalbackground_tbl.studentid = ?; `, [lastname, firstname, middlename, birthdate, birthplace, gender, citizenship, religion, parent, address, studentid])
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
                WHERE educationalbackground_tbl.studentid = ?; `, [
            elementaryschoolname, elementaryschooladdress, elementaryyeargraduated,
            secondaryschoolname, secondaryschooladdress, secondaryyeargraduated,
            tertiaryschoolname, tertiaryschooladdress, tertiaryyeargraduated, studentid])
        res.json({ message: 'Educational Background Record Updated' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Updating Educational Background Record: ', error: error.message })
    }
})
app.put('/updateOtherInformation', async (req, res) => {
    try {
        const { nstpserialnumber, boardresolution, notes, yeargraduated, studentid } = req.body
        const [rows] = await db.query(`
            UPDATE otherinformation_tbl SET nstpserialnumber = ?, boardresolution = ?, notes = ?, yeargraduated = ? WHERE otherinformation_tbl.studentid = ?;`, [nstpserialnumber, boardresolution, notes, yeargraduated, studentid])
        res.json({ message: 'Other Information Record Updated' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Updating Other Information Record: ', error: error.message })
    }
})
app.put('/updateSemestralRating', async (req, res) => {
    try {
        const { courseno, title, grade, reex, credit, id } = req.body
        console.log(courseno, title, grade, reex, credit, id)
        const [rows] = await db.query(`
            UPDATE subjectstaken_tbl SET
        coursenumber = ?, descriptivetitle = ?, finalgrade = ?, reex = ?, credit = ?
            WHERE subjectstaken_tbl.id = ?; `, [courseno, title, grade, reex, credit, id])
        res.json({ message: 'Record Updated' })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: 'Error Updating Admission Record: ', error: error.message })
    }
})
app.put('/updateTransferOutToGranted', async (req, res) => {
    try {
        const { granted_date, request_type, schoolname, schooladdress, transfer_status, studentid } = req.body
        const [rows] = await db.query(`
            UPDATE transferred_out_tbl SET granted_date = ?, request_type = ?, schoolname = ?, schooladdress = ?, transfer_status = ? WHERE transferred_out_tbl.studentid = ?;`, [granted_date, request_type, schoolname, schooladdress, transfer_status, studentid])
        res.json({ message: 'Data Updated' })
    } catch (error) {
        console.log(error)
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

app.listen(process.env.MYSQL_ADDON_PORT/* 3002 */, () => {
    console.log(`Server is running on localhost:${process.env.MYSQL_ADDON_PORT/* 3002 */} `)
})