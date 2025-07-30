const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();
const bodyParser = require('body-parser');
const xlsx = require('xlsx');
const multer = require('multer');
const pdfdocument = require('pdfkit');
const path = require('path');
const PORT = process.env.PORT || 3001;
const os = require('os');
const fs = require('fs');
const csv = require('csv-parser');

require('dotenv').config();


app.use(cors());
app.use(bodyParser.json());
//Database connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
});

const storage = multer.diskStorage({
    destination: "./uploads",
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    },
});
function capitalizeEveryWord(sentence) {
    return sentence
        .split(' ')  // Split the sentence into words
        .map(word => {
            // Capitalize the first letter and make the rest lowercase
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(' ');  // Join the words back together with spaces
}
const upload = multer({ storage });
// Upload Endpoint
app.post("/api/mysql/upload", upload.single("image"), (req, res) => {
    const imagePath = req.file.path;
    const id = req.body.id;
    try {
        const result = db.execute('INSERT INTO attachment_tbl (studentid, files) VALUES (?, ?)', [id, imagePath]);
        res.status(201).json({ message: 'Added Sucessfully' });
    } catch (error) {
        console.log(error);
    }
});
/* app.get('/api/mysql/delete/:id', async (req, res) => {
    const id = req.params.id;
    try{
        const result = await db.query("SELECT * FROM attachment_tbl WHERE id = ?", [id]);
        res.json(result[0]);
    } catch(error){
        console.log(error);
    }
}) */
app.delete('/api/mysql/delete/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await db.query("SELECT * FROM attachment_tbl WHERE id = ?", [id]);
        const filePath = path.join(__dirname, '', result[0][0].files);
        fs.unlink(filePath, (fsErr) => {
            if (fsErr && fsErr.code !== 'ENOENT') {
                return res.status(500).send('Error deleting file.');
            }
            const deleteQuery = 'DELETE FROM attachment_tbl WHERE id = ?';
            db.query(deleteQuery, [id], (delErr) => {
                if (delErr) return res.status(500).send('Error deleting DB record.');
                res.send('File and record deleted successfully.');
            });
        })
        res.json({ message: 'File and Data Deleted' });
    } catch (error) {
        console.log(error);
    }
})

/* app.delete("/api/mysql/delete/:id", async (req, res) => {
  const fileId = req.params.id;

  // 1. Get the filename/path from the DB
  const selectQuery = 'SELECT * FROM attachment_tbl WHERE id = ?';
  db.query(selectQuery, [fileId], (err, results) => {
    if (err) return res.status(500).send('Database error.');
    if (results.length === 0) return res.status(404).send('File not found in database.');

    const filePath = path.join(__dirname, 'uploads', results[0].filename);

    // 2. Delete the file from the filesystem
    fs.unlink(filePath, (fsErr) => {
      if (fsErr && fsErr.code !== 'ENOENT') {
        return res.status(500).send('Error deleting file.');
      }

      // 3. Delete the record from the DB
      const deleteQuery = 'DELETE FROM attachment_tbl WHERE id = ?';
      db.query(deleteQuery, [fileId], (delErr) => {
        if (delErr) return res.status(500).send('Error deleting DB record.');
        res.send('File and record deleted successfully.');
      });
    });
  });
}); */


app.post("/api/mysql/uploadRatings", upload.single("file"), (req, res) => {
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

});


// Upload Endpoint
app.put("/api/mysql/uploadProfilePhoto", upload.single("image"), (req, res) => {
    const imagePath = req.file.path;
    const id = req.body.id;
    try {
        const result = db.execute('UPDATE personalbackground_tbl SET photo=? WHERE studentid=?', [imagePath, id]);
        res.status(201).json({ message: 'Added Sucessfully' });
    } catch (error) {
        console.log(error);
    }
});

// Retrieve Images
app.use('/uploads', express.static('uploads'));
app.get('/api/mysql/getImages', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM `attachment_tbl` WHERE studentid=?', [`${id}`]);
        const images = result[0].map((row) => ({
            id: row.id,
            studentid: row.studentid,
            url: `http://localhost:3001/${row.files}`,
        }));
        res.json(images);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

//Fetch data in request table and returns a the list according to status
app.get('/api/mysql/getWalkInRequestData', async (req, res) => {
    const { status1, status2 } = req.query;
    if (!status1 || !status2) {
        return res.status(400).json({ message: 'Status parameter is required' });
    }

    try {
        const [rows] = await db.query(
            'SELECT * FROM request_tbl WHERE status = ? OR status = ? ORDER BY date_requested DESC',
            [status1, status2]
        );
        res.json(rows);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

//Fetch data in request table and returns a the number of counts
app.get('/api/mysql/getRequestCounts', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                COUNT(CASE WHEN status = 1 THEN 1 END) AS pending,
                COUNT(CASE WHEN status = 2 THEN 1 END) AS onprocess,
                COUNT(CASE WHEN status = 3 THEN 1 END) AS filed,
                COUNT(CASE WHEN status = 4 THEN 1 END) AS released,
                COUNT(CASE WHEN status = 6 THEN 1 END) AS mailing,
                COUNT(CASE WHEN status = 5 THEN 1 END) AS pending_paid
            FROM request_tbl
        `);
        const count = {
            pending: rows[0].pending_paid + rows[0].pending,
            onprocess: rows[0].onprocess,
            filed: rows[0].filed,
            released: rows[0].released,
            mailing: rows[0].mailing,
        };
        res.json(count);
    } catch (error) {
        console.error('Error fetching count:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

//Fetch current request count
app.get('/api/mysql/getCurrentRequestCount', async (req, res) => {
    try {
        const count = await db.query(`
            SELECT COUNT(*) AS count
            FROM request_tbl
            WHERE date_requested >= CURDATE() AND date_requested < CURDATE() + INTERVAL 1 DAY;
        `);
        res.json(count);
    } catch (error) {
        console.error('Error fetching count:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

//Search data in request
app.get('/api/mysql/searchData', async (req, res) => {
    const searchQuery = req.query.name;
    try {
        const result = await db.query(`SELECT * FROM request_tbl WHERE name LIKE ?`, [`%${searchQuery}%`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }

});

app.get('/api/mysql/paginationRequest', async (req, res) => {
    const { status1, status2 } = req.query;
    const page = parseInt(req.query.page) || 1;
    try {
        const items = await db.query(`SELECT * FROM request_tbl WHERE status = ? OR status = ? ORDER BY date_requested DESC`, [status1, status2]);
        const count = await db.query(
            `SELECT
                COUNT(*) AS totalrequest,
                COUNT(CASE WHEN status = 1 THEN 1 END) AS pending,
                COUNT(CASE WHEN status = 2 THEN 1 END) AS onprocess
            FROM request_tbl`);
        const totalItems = count[0][0].totalrequest;
        const totalPending = count[0][0].pending;
        const totalOnprocess = count[0][0].onprocess;
        //const totalPages = Math.ceil(totalItems / limit);
        res.json({
            data: items[0],
            totalItems,
            totalPending,
            totalOnprocess,
        });
    } catch (error) {
        console.log(error)
    }
});

app.post('/api/mysql/addNewRequest', async (req, res) => {
    const { date_requested, time_requested, name, course, contact, requests, purpose, status } = req.body;
    if (!name || !course || !contact || !requests || !purpose) {
        return res.status(400).json({ message: 'Please fill empty fields' });
    }
    try {
        if (!Array.isArray(requests)) {
            return res.status(400).json({ message: 'Invalid data format. Expected an array.' });
        }
        const request_values = requests.join(',');
        const purpose_values = purpose.join(',');
        const result = db.execute('INSERT INTO `request_tbl` (`id`, `date_requested`, `time_requested`, `name`, `course`, `contact`, `requests`, `purpose`, `status`) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?);', [date_requested, time_requested, name, course, contact, request_values, purpose_values, status]);
        res.status(201).json({ message: 'Added Sucessfully', userId: result.insertId });

    } catch (error) {
        console.log(error)
    }
});

app.put('/api/mysql/updateRequest/:id', async (req, res) => {
    const { id, status, or_number, or_date, docstamp, docs_date } = req.body;
    try {
        const result = await db.execute('UPDATE request_tbl SET status = ?, or_number = ?, or_date = ?, docstamp = ?, docstamp_date = ? WHERE id= ?', [status, or_number, or_date, docstamp, docs_date, id]);
        res.status(201).json({ message: 'Status Updated', result });

    } catch (error) {
        console.log(error);
    }
});

app.put('/api/mysql/releaseRequest/:id', async (req, res) => {
    const { id, status, date_released, time_released, released_to, name, document_presented } = req.body;
    try {
        const result = await db.execute('UPDATE request_tbl SET status = ?, date_released = ?, time_released = ?, receiver = ?, receiver_name = ?, document_presented = ? WHERE id= ?', [status, date_released, time_released, released_to, name, document_presented, id]);
        res.status(201).json({ message: 'Status Updated', result });

    } catch (error) {
        console.log(error);
    }
});

app.put('/api/mysql/fileRequest/:id', async (req, res) => {
    const { id, status, date_filed } = req.body;
    try {
        const result = await db.execute('UPDATE request_tbl SET status = ?, date_filed = ? WHERE id= ?', [status, date_filed, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.log(error);
    }
});

app.put('/api/mysql/setRequestPending/:id', async (req, res) => {
    const { id, status, reasons } = req.body;
    try {
        const result = await db.execute('UPDATE request_tbl SET status = ?, pending_reasons = ? WHERE id= ?', [status, reasons, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.log(error);
    }
});

app.put('/api/mysql/processRequest/:id', async (req, res) => {
    const { id, status } = req.body;
    try {
        const result = await db.execute('UPDATE request_tbl SET status = ? WHERE id= ?', [status, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.log(error);
    }
});

app.get('/api/mysql/getTransferredInList', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM transferred_in_tbl ORDER BY date DESC');
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/searchTransferredIn', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT * FROM transferred_in_tbl WHERE firstname LIKE ? OR lastname LIKE ? OR middlename LIKE ?`,
            [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }

});

app.get('/api/mysql/getTransferredInTotalCount', async (req, res) => {
    try {
        const result = await db.query('SELECT COUNT(*) as count FROM transferred_in_tbl');
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getTransferredInCourse', async (req, res) => {
    try {
        const result = await db.query('SELECT course FROM transferred_in_tbl GROUP BY course ORDER BY course ASC;');
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/filterTransferredIn', async (req, res) => {
    const startDate = req.query.start;
    const endDate = req.query.end;
    try {
        const result = await db.query(`SELECT * FROM transferred_in_tbl WHERE date BETWEEN ? AND ?;`,
            [`${startDate}`, `${endDate}`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }

});

app.post('/api/mysql/addNewTransferredIn', async (req, res) => {
    const { date, lastname, firstname, middlename, course, major, schoolname, address } = req.body;
    try {
        const result = db.execute('INSERT INTO `transferred_in_tbl` (`id`, `date`, `lastname`, `firstname`, `middlename`, `course`, `major`, `schoolname`, `schooladdress`) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?);', [date, lastname, firstname, middlename, course, major, schoolname, address]);
        res.status(201).json({ message: 'Added Sucessfully', userId: result.insertId });

    } catch (error) {
        console.log(error)
    }
});

app.get('/api/mysql/exportListInExcel', async (req, res) => {
    const result = await db.query('SELECT * FROM transferred_in_tbl ORDER BY date DESC');
    const worksheet = xlsx.utils.json_to_sheet(result[0]);
    const workbook = xlsx.utils.book_new();

    xlsx.utils.book_append_sheet(workbook, worksheet, 'Data');
    const file = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });

    res.setHeader('Content-Disposition', 'attachment; filename=data.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    // Send the file as response
    res.send(file);
});

app.get('/api/mysql/getTransferredOutList', async (req, res) => {
    try {
        const status1 = req.query.status1;
        const status2 = req.query.status2;

        const result = await db.query('SELECT * FROM transferred_out_tbl WHERE transfer_status = ? OR transfer_status = ? ORDER BY lastname ASC;', [`${status1}`, `${status2}`]);
        res.json({
            data: result[0],
        });
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getBORList', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM bor_resolution_tbl');
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getTransferredOutTotalCount', async (req, res) => {
    try {
        const course_count = await db.query(`SELECT course, 
            COUNT(CASE WHEN transfer_status = 2 THEN 1 END) AS granted,
            COUNT(CASE WHEN transfer_status = 1 THEN 1 END) AS informative 
            FROM transferred_out_tbl GROUP BY course ORDER BY course ASC;`);
        const total_count = await db.query(`SELECT
                COUNT(CASE WHEN transfer_status = 2 THEN 1 END) AS granted,
                COUNT(CASE WHEN transfer_status = 1 THEN 1 END) AS informative 
                FROM transferred_out_tbl;`);
        res.json({
            count: course_count[0],
            total_count: total_count[0],
        });
    } catch (error) {
        console.error('Error fetching count:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/searchTransferredOut', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT * FROM transferred_out_tbl WHERE firstname LIKE ? OR lastname LIKE ? OR middlename LIKE ? OR studentid LIKE ? ORDER BY lastname ASC`,
            [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/searchStudent', async (req, res) => {
    const searchQuery = req.query.search;
    ;
    try {
        const result = await db.query(`SELECT personalbackground_tbl.studentid, personalbackground_tbl.lastname, personalbackground_tbl.firstname, personalbackground_tbl.middlename, admission_tbl.course FROM personalbackground_tbl JOIN admission_tbl ON personalbackground_tbl.studentid = admission_tbl.student_id WHERE firstname LIKE ? OR lastname LIKE ? OR middlename LIKE ? OR studentid LIKE ? ORDER BY lastname ASC`,
            [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/filterTransferredOut', async (req, res) => {
    const startDate = req.query.start;
    const endDate = req.query.end;
    try {
        const result = await db.query(`SELECT * FROM transferred_out_tbl WHERE informative_date  BETWEEN ? AND ? OR granted_date  BETWEEN ? AND ?;`, [`${startDate}`, `${endDate}`, `${startDate}`, `${endDate}`]);
        res.json({
            data: result[0],
        });
    } catch (error) {
        console.log('Error searching: ', error);
    }

});

app.get('/api/mysql/getTransferReportCount', async (req, res) => {
    const startDate = req.query.start;
    const endDate = req.query.end;
    try {
        const count = await db.query(`
            SELECT course, 
            COUNT(CASE WHEN transfer_status = 2 THEN 1 END) AS granted,
            COUNT(CASE WHEN transfer_status = 1 THEN 1 END) AS informative 
            FROM transferred_out_tbl WHERE informative_date BETWEEN ?  AND ? OR granted_date BETWEEN ? AND ? GROUP BY course ORDER BY course ASC;`,
            [`${startDate}`, `${endDate}`, `${startDate}`, `${endDate}`]);
        const total_count = await db.query(`
                SELECT 
                COUNT(CASE WHEN transfer_status = 2 THEN 1 END) AS granted,
                COUNT(CASE WHEN transfer_status = 1 THEN 1 END) AS informative 
                FROM transferred_out_tbl WHERE informative_date BETWEEN ?  AND ? OR granted_date BETWEEN ? AND ?`,
            [`${startDate}`, `${endDate}`, `${startDate}`, `${endDate}`]);
        res.json({
            count: count[0],
            total_count: total_count[0]
        });
    } catch (error) {
        console.log(error);
    }
});

app.post('/api/mysql/addNewTransferredOut', async (req, res) => {
    const { transfer_date, studentid, lastname, firstname, middlename, gender, course, major, status, yeargraduated, lastsemesterattended, academicyear, or_number, or_date, docstamp, docstamp_date, transfer_status } = req.body;
    try {
        const params = [studentid, firstname, lastname, middlename, gender, course, major, status, yeargraduated, lastsemesterattended, academicyear, or_number, or_date, docstamp, docstamp_date, transfer_date, transfer_status];
        const result = db.execute('INSERT INTO `transferred_out_tbl` (`studentid`, `firstname`, `lastname`, `middlename`, `gender`, `course`, `major`, `status`, `yeargraduated`,`lastsemesterattended`,`academicyear`, `or_number`, `or_date`, `docstamp`, `docstamp_date`, `informative_date`,`transfer_status`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);', params);
        res.status(201).json({ message: 'Added Sucessfully', userId: result.insertId, params: params });
    } catch (error) {
        console.log(error)
    }
});

app.get('/api/mysql/getCourseList', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM courses_tbl ORDER BY course_id ASC');
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getMajorList', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM majors_tbl WHERE major_id = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getTransferInfo', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM transferred_out_tbl WHERE studentid = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getStudentListTransferredOut', async (req, res) => {
    const schoolname = req.query.schoolname;
    try {
        const result = await db.query('SELECT studentid, firstname, lastname, course, major, granted_date FROM transferred_out_tbl WHERE schoolname = ? ORDER BY lastname ASC', [`${schoolname}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getRating', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM subjectstaken_tbl WHERE id = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.put('/api/mysql/updateRating', async (req, res) => {
    const { id, coursenumber, descriptivetitle, finalgrade, reex, credit } = req.body;
    try {
        const result = await db.query('UPDATE subjectstaken_tbl SET coursenumber = ?, descriptivetitle = ?, finalgrade = ?, reex = ?, credit = ? WHERE id = ?', [coursenumber, descriptivetitle, finalgrade, reex, credit, id]);
        res.status(201).json({ message: 'Data Updated', result });
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getINCInformation', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM inc_transaction_tbl WHERE id = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getCertificationInfo', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM enrollment_tbl WHERE id = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.put('/api/mysql/updateInformativeToGranted', async (req, res) => {
    const { id, schoolname, schooladdress, date, status } = req.body;
    try {
        const result = await db.execute('UPDATE transferred_out_tbl SET schoolname = ?, schooladdress = ?, granted_date = ?, transfer_status = ? WHERE studentid= ?', [schoolname, schooladdress, date, status, id]);
        res.status(201).json({ message: 'Status Updated', result });

    } catch (error) {
        console.log(error);
    }
});

app.put('/api/mysql/updateTransferData', async (req, res) => {
    const { id, studentid, lastname, firstname, middlename, gender, course, major, status, yeargraduated, academicyear, or_number, or_date, docstamp, docstamp_date, schoolname, schooladdress, granted_date } = req.body;
    try {
        const result = await db.execute('UPDATE transferred_out_tbl SET studentid = ?, lastname = ?, firstname = ?, middlename = ?, gender = ?, course = ?, major = ?, status = ?, yeargraduated = ?, academicyear = ?, or_number = ?, or_date = ?, docstamp = ?, docstamp_date = ?, schoolname = ?, schooladdress= ?, granted_date = ? WHERE id= ?', [studentid, lastname, firstname, middlename, gender, course, major, status, yeargraduated, academicyear, or_number, or_date, docstamp, docstamp_date, schoolname, schooladdress, granted_date, id]);
        res.status(201).json({ message: 'Status Updated', result });

    } catch (error) {
        console.log(error);
    }
});

app.post('/api/mysql/addTORTransactions', async (req, res) => {
    const { studentid, ornumber, ordate, docstamp, docstampdate, remarks, dateissued, showaverage, dategenerated, timegenerated } = req.body;
    try {
        const params = [studentid, ornumber, ordate, docstamp, docstampdate, remarks, dateissued, showaverage, dategenerated, timegenerated];
        const result = db.execute('INSERT INTO `tortransactions_tbl` (`id`, `studentid`, `ornumber`, `ordate`, `docstamp`, `docstampdate`, `remarks`, `dateissued`, `showaverage`, `dategenerated`, `timegenerated`) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);', params);
        res.status(201).json({ message: 'Added Sucessfully', userId: result.insertId });
    } catch (error) {
        console.log(error)
    }
});

app.post('/api/mysql/addNewStudentRecord', async (req, res) => {
    const { studentid, admission_date, entrance_credential, course, major, lastname, firstname, middlename, birthdate, birthplace, sex, citizenship, religion, parentguardian, permanentaddress, elementaryschool, elementaryaddress, elementaryyeargraduated, secondaryschool, secondaryaddress, secondaryyeargraduated, tertiaryschool, tertiaryaddress, tertiaryyeargraduated } = req.body;
    let connection;
    try {
        const admission_params = [studentid, admission_date, entrance_credential, course, major];
        const personalbackground_params = [studentid, lastname, firstname, middlename, birthdate, birthplace, sex, citizenship, religion, parentguardian, permanentaddress];
        const educationalbackground_params = [studentid, elementaryschool, elementaryaddress, elementaryyeargraduated, secondaryschool, secondaryaddress, secondaryyeargraduated, tertiaryschool, tertiaryaddress, tertiaryyeargraduated];
        connection = await db.getConnection();
        await connection.beginTransaction();
        const insert_admission = connection.execute('INSERT INTO admission_tbl (student_id, admission_date, entrance_credential, course, major) VALUES (?, ?, ?, ?, ?);', admission_params);
        const insert_personalbackground = connection.execute('INSERT INTO personalbackground_tbl (studentid, lastname, firstname, middlename, birthdate, birthplace, sex, citizenship, religion, parentguardian, permanentaddress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);', personalbackground_params);
        const insert_educationalbackground = connection.execute('INSERT INTO educationalbackground_tbl (studentid, elementaryschool, elementaryaddress, elementaryyeargraduated, secondaryschool, secondaryaddress, secondaryyeargraduated, tertiaryschool, tertiaryaddress, tertiaryyeargraduated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);', educationalbackground_params);
        await connection.commit();
        res.json({ success: true, message: 'Added Sucessfully' });
    } catch (error) {
        if (connection) await connection.rollback(); // Rollback on error
        res.status(500).json({ success: false, message: 'Transaction failed', error: error.message })
    } finally {
        if (connection) connection.release();
    }
});


app.get('/api/mysql/generateTOR', async (req, res) => {
    const id = req.query.id;
    const logoPath = path.join(__dirname, 'logo.png');
    const logoPath1 = path.join(__dirname, 'logo1.png');
    const document = path.join(__dirname, 'document.png');
    const rating = path.join(__dirname, 'rating.png');
    const iso = path.join(__dirname, 'iso.png');
    let x = 15;
    try {

        const doc = new pdfdocument({ size: 'FOLIO', bufferPages: true });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=report.pdf');
        doc.pipe(res);

        const query_personal_info = await db.query('SELECT * FROM personalbackground_tbl INNER JOIN admission_tbl ON personalbackground_tbl.studentid = admission_tbl.student_id WHERE personalbackground_tbl.studentid = ?', [`${id}`]);
        const query_educational_background = await db.query('SELECT * FROM `educationalbackground_tbl` WHERE studentid = ?', [`${id}`]);
        const getsemester = await db.query('SELECT semester,academicyear,course,major FROM subjectstaken_tbl WHERE studentid = ? GROUP BY academicyear, semester ORDER BY academicyear ASC', [`${id}`]);
        const subjects = await db.query('SELECT * FROM subjectstaken_tbl WHERE studentid= ? ORDER BY academicyear ASC;', [`${id}`]);
        const ornumbers = await db.query('SELECT * FROM `tortransactions_tbl` WHERE studentid = ? AND dategenerated = CURRENT_DATE() ORDER BY timegenerated DESC LIMIT 1;', [`${id}`]);
        const notes = await db.query('SELECT * FROM `otherinformation_tbl` WHERE studentid = ?;', [`${id}`]);
        const copyfor = await db.query('SELECT * FROM `transferred_out_tbl` WHERE studentid = ?;', [`${id}`]);
        const attachment = await db.query('SELECT * FROM `attachment_tbl` WHERE studentid = ?', [`${id}`]);
        let query_result = [];
        let getornumbers = [];
        let profile = '';
        let course = '';
        ornumbers[0].forEach((row, index) => {
            getornumbers.push({
                ornumber: row.ornumber,
                ordate: row.ordate,
                docstamp: row.docstamp,
                docstamp_date: row.docstampdate,
            })
        });
        const Page01_Content = () => {
            doc.moveDown(10);
            const options = {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            };
            doc.fillColor('black');

            doc.font('public/font/Cambria-Bold.ttf').fontSize(11).text('PERSONAL BACKGROUND', 50, 155, { underline: true });
            let list = ['STUDENT NUMBER', 'STUDENT NAME', 'BIRTH DATE', 'BIRTH PLACE', 'SEX', 'CITIZENSHIP', 'RELIGION', 'PARENT/GUARDIAN', 'PERMANENT ADDRESS', 'DATE OF ADMISSION', 'ENTRANCE CREDENTIAL'];

            query_personal_info[0].forEach((row, index) => {
                const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                const birthdate = new Date(row.birthdate)

                const hyphenatedDate = `${months[birthdate.getMonth()].slice(0, 3)}-${birthdate.getDate()}-${birthdate.getFullYear()}`;
                query_result = [`${row.studentid}`, `${row.lastname}, ${row.firstname} ${row.middlename}`, `${hyphenatedDate}`, `${row.birthplace}`, `${row.sex}`, `${row.citizenship}`, `${row.religion}`, `${row.parentguardian}`, `${row.permanentaddress}`, `${new Date(row.admission_date).toLocaleDateString('en-ASIA', options)}`, `${row.entrance_credential}`];
                profile = row.photo;
                course = row.course;
            });
            let v = 20;
            let fs = '';
            let docX = 0;
            for (let i = 0; i < list.length; i++) {
                docX = i == 9 || i == 10 ? 50 : 80;
                fs = i == 1 ? 'Bold' : 'Regular';

                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${list[i]}`, docX, 175 + v * i);
                doc.fontSize(11).text(':', 80 * 2.8, 175 + v * i);
                uc = i == 1
                    ? doc.fontSize(11).font(`public/font/Cambria-${fs}.ttf`).text(`${query_result[i].toUpperCase()}`, 80 * 3, 175 + v * i)
                    : doc.fontSize(11).font(`public/font/Cambria-${fs}.ttf`).text(`${capitalizeEveryWord(query_result[i])}`, 80 * 3, 175 + v * i);;
                //doc.fontSize(11).font(`public/font/Cambria-${fs}.ttf`).text(`${query_result[i].uc}`, 80 * 3, 175 + v * i);
            }
            profile != '' ? doc.image(`${profile}`, 50 * 9, 200, { width: 120 }) : '';
            doc.lineWidth(1).moveTo(30, 390).lineTo(580, 390).stroke();
            doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text('EDUCATIONAL BACKGROUND', 50, 395, { underline: true });
            doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text('SCHOOL LAST ATTENDED', 80 * 3, 395);
            let a = ['ELEMENTARY', 'SECONDARY', 'TERTIARY'];
            let schoolname = [];
            let schooladdress = [];
            let yeargrad = [];
            query_educational_background[0].forEach((row, index) => {
                schoolname.push(row.elementaryschool, row.secondaryschool, row.tertiaryschool);
                schooladdress.push(row.elementaryaddress, row.secondaryaddress, row.tertiaryaddress);
                yeargrad.push(row.elementaryyeargraduated, row.secondaryyeargraduated, row.tertiaryyeargraduated);
            });
            for (let i = 0; i < a.length; i++) {
                let dist = i == 0 ? 420 : doc.y + 5;
                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${a[i]}`, 80, dist);
                doc.fontSize(11).text(':', 80 * 2.8, dist);
                doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(capitalizeEveryWord(`${schoolname[i]}`), 80 * 3, dist);
                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text('YEAR', 470, dist);
                doc.fontSize(11).text(':', 505, dist);
                doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`${yeargrad[i]}`, 515, dist);
                doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(capitalizeEveryWord(`${schooladdress[i]}`), 80 * 3, dist + 20);
            }
            doc.lineWidth(1).moveTo(30, 535).lineTo(580, 535).stroke();
            doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text('GRADING SYSTEM', 50, 540, { underline: true });
            const description = ['GRADE', 'EQUIVALENT', 'GRADE', 'EQUIVALENT', 'GRADE', 'EQUIVALENT'];
            const maed_description = ['RATING', 'DESCRIPTION'];
            /*  console.log(course); */
            if (course == 'MAED' || course == 'EDD') {
                for (let i = 0; i < maed_description.length; i++) {
                    if (i == 0) {
                        doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${maed_description[i]}`, doc.x + 10 * 15, doc.y + 5, { underline: true, continued: true });
                    } else if (i == maed_description.length - 1) {
                        doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${description[i]}`, doc.x + 40 * 3, doc.y, { underline: true, continued: false });
                    }
                }
                let i1 = ['1.0 – 1.2', '1.3 – 1.4', '1.5 – 1.7', '1.8 – 1.9', '2.0', 'Below 2.0'];
                let i2 = ['Excellent', 'Very Good', 'Good', 'Fair', 'Passed', 'Failure'];
                let i3 = [1.9, '2.0', 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7];
                let i4 = [86, 85, 84, 83, 82, 81, 80, 79, 78];
                let i5 = [2.8, 2.9, '3.0', '5.0', '', 'INC', 'INP', 'DR', ''];
                let i6 = [77, 76, 75, 'Failed', '', 'Incomplete', 'In Progress', 'Dropped', ''];
                for (let i = 0; i < i1.length; i++) {
                    doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`${i1[i]}`, 60 * 3.33, 580 + i * 15, { align: 'center', width: 60 });
                    doc.fontSize(11).text(`${i2[i].toUpperCase()}`, 130 * 2.78, 580 + i * 15, { align: 'left', width: 60 });
                }
                doc.fontSize(11).text(`INC – Incomplete`, 150, doc.y + 5, { align: 'left', continued: true });
                doc.fontSize(11).text(`DR – Dropped`, doc.x + 50, doc.y, { align: 'left', continued: true });
                doc.fontSize(11).text(`INP – In Progress`, doc.x + 50, doc.y, { align: 'left', continued: false });
            } else {
                for (let i = 0; i < description.length; i++) {
                    if (i == 0) {
                        doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${description[i]}`, doc.x + 10, doc.y + 5, { underline: true, continued: true });
                    } else if (i == description.length - 1) {
                        doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${description[i]}`, doc.x + 40, doc.y, { underline: true, continued: false });
                    } else {
                        doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${description[i]}`, doc.x + 40, doc.y, { underline: true, continued: true });
                    }
                }
                let i1 = ['1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8'];
                let i2 = ['98 - 100', '96 - 97', ' 93 - 95', 92, 91, 90, 89, 88, 87];
                let i3 = [1.9, '2.0', 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7];
                let i4 = [86, 85, 84, 83, 82, 81, 80, 79, 78];
                let i5 = [2.8, 2.9, '3.0', '5.0', '', 'INC', 'INP', 'DR', ''];
                let i6 = [77, 76, 75, 'Failed', '', 'Incomplete', 'In Progress', 'Dropped', ''];
                for (let i = 0; i < i1.length; i++) {
                    doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`${i1[i]}`, 60, 580 + i * 15, { align: 'center', width: 40 });
                    doc.fontSize(11).text(`${i2[i]}`, 140, 580 + i * 15, { align: 'center', width: 60 });
                    doc.fontSize(11).text(`${i3[i]}`, 235, 580 + i * 15, { align: 'center', width: 40 });
                    doc.fontSize(11).text(`${i4[i]}`, 320, 580 + i * 15, { align: 'center', width: 60 });
                    doc.fontSize(11).text(`${i5[i]}`, 420, 580 + i * 15, { align: 'center', width: 40 });
                    if (i == i6.length - 1) {
                        doc.fontSize(11).text(`${i6[i]}`, 500, 580 + i * 15, { align: 'center', width: 60, continued: false });
                    } else {
                        doc.fontSize(11).text(`${i6[i]}`, 500, 580 + i * 15, { align: 'center', width: 60 });
                    }

                }
            }
            doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`One collegiate unit of credit is one hour lecture each week or a total of 18 hours in a semester. Three hours of laboratory work, drafting, or shop work each week or a total of 54 hours a semester has an equivalent credit unit as prescribed in the Policies, Standards and Guidelines (PSGs) of the program.`, 50, doc.y + 20, { align: 'justify', underline: false, width: 520 });
            doc.moveDown();
            doc.fontSize(11).text(`The semestral grade point average (GPA) is computed by multiplying each grade by the corresponding unit per grade and dividing the sum of these products by the total number of units enrolled in the semester. `, doc.x, doc.y, { align: 'justify', width: 520 });
        }
        const name = () => {
            doc.lineWidth(1).moveTo(30, 170).lineTo(580, 170).stroke();
            doc.fontSize(12).font('public/font/Cambria-Bold.ttf').text('COURSE NO', 40, 173, { continued: true });
            doc.fontSize(12).text('DESCRIPTIVE TITLE', 80, 173, { continued: true });
            doc.fontSize(12).text('FINAL GRADE', 230, 173, { continued: true });
            doc.fontSize(12).text('RE-EX', 245, 173, { continued: true });
            doc.fontSize(12).text('CREDIT', 260, 173);
            doc.lineWidth(1).moveTo(30, 190).lineTo(580, 190).stroke();

            doc.fontSize(14).text(`${query_result[0]}`, 50, 150, { continued: true });
            doc.fontSize(14).text(`${query_result[1].toUpperCase()}`, 50 * 3, 150);
            doc.moveDown(2);
        }
        const name1 = () => {
            doc.lineWidth(1).moveTo(30, 170).lineTo(580, 170).stroke();
            doc.font('public/font/Cambria-Bold.ttf').fontSize(14).text(`${query_result[0]}`, 50, 150, { continued: true });
            doc.fontSize(14).text(`${query_result[1]}`, 50 * 3, 150);
            doc.moveDown(2);
        }
        const Page02_Content = () => {
            doc.addPage();
            name();
            let sem = [{ semester: '', academicyear: '', course: '', major: '' }];
            getsemester[0].forEach((row, index) => {
                sem.push({ semester: row.semester, year: row.academicyear, course: row.course, major: row.major });
            });
            let x;
            let fontsize = 0;
            for (let i = 1; i < sem.length; i++) {
                x = i * 180;
                let s = '';/* sem[i].semester == 1 ? '1st Sem' : '2nd Sem'; */
                if (sem[i].semester == 1) {
                    s = '1st Sem';
                } else if (sem[i].semester == 2) {
                    s = '2nd Sem';
                } else {
                    s = 'Summer';
                }
                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${s}`, 45, doc.y, { lineGap: 7 });
                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${sem[i].year}`, doc.x + 60, doc.y - 18, { lineGap: 7 });
                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${sem[i].course}`, 32 * 6, doc.y - 20, { lineGap: 7, continued: true });
                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`${sem[i].major != '' ? sem[i].major : 'NONE'}`, doc.x + 60, doc.y + 1, { lineGap: 7 });
                for (let j = 0; j < subjects[0].length; j++) {
                    if (sem[i].semester == subjects[0][j].semester && sem[i].year == subjects[0][j].academicyear) {
                        fontsize = subjects[0][j].descriptivetitle.length > 55 ? 10 : 11;
                        if (doc.y >= 780) {
                            doc.addPage();
                            name();
                            doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`${subjects[0][j].coursenumber}`, 50, doc.y, { lineGap: 3 });
                            doc.fontSize(fontsize).text(`${subjects[0][j].descriptivetitle}`, 142, doc.y - 17, { lineGap: 3 });
                            doc.fontSize(11).text(`${subjects[0][j].finalgrade}                      ${subjects[0][j].reex}`, 160 * 2.7, doc.y - 17, { lineGap: 3 });
                            doc.fontSize(11).text(`${subjects[0][j].credit}`, 550, doc.y - 17, { width: 25, lineGap: 3, align: 'center' });

                        } else {
                            doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`${subjects[0][j].coursenumber}`, 50, doc.y, { lineGap: 3 });
                            doc.fontSize(fontsize).text(`${subjects[0][j].descriptivetitle}`, 142, doc.y - 17, { lineGap: 3 });
                            doc.fontSize(11).text(`${subjects[0][j].finalgrade}                      ${subjects[0][j].reex}`, 160 * 2.7, doc.y - 17, { lineGap: 3 });
                            doc.fontSize(11).text(`${subjects[0][j].credit}`, 550, doc.y - 17, { width: 25, lineGap: 3, align: 'center' });
                        }
                        /* if (j == 37) {
                            doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`xxxxx`, 50, doc.y, { lineGap: 3, continued: true });
                            doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`xxxxx`, 517, doc.y, { lineGap: 3 });
                        } */

                    }
                }
            }
            let units = [];
            subjects[0].forEach((row) => {
                units.push({ credit: row.credit, grade: row.finalgrade, reex: row.reex });
            });
            // console.log(subjects[0]);
            //console.log(units);

            const totalCredits = units
                .filter(item => !isNaN(item.credit))
                .reduce((acc, item) => acc + Number(item.credit), 0);
            const total = units
                .filter(item => !isNaN(item.credit) && (!isNaN(item.grade) || ((item.grade === 'INC' || item.grade === 'INP') && !isNaN(item.reex))))
                .map(item => Number(item.credit) * ((item.grade === 'INC' || item.grade === 'INP') ? Number(item.reex) : Number(item.grade)))
                .reduce((acc, value) => acc + value, 0);
            const average = (total / totalCredits).toFixed(3);
            let y = 5;
            if (ornumbers[0][0].showaverage == 'YES') {
                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`General Average:`, 0, doc.y, { align: 'right', continued: true });
                doc.fontSize(11).text(`${average}`, doc.x + 40, doc.y, { lineGap: 3 });
                y = 0;
            }
            notes[0][0] === undefined ? '' : doc.fontSize(10.5).font('public/font/Cambria-Bold.ttf').text(`NSTP Serial Number: ${notes[0][0].nstpserialnumber} (As required by CHED Memorandum Order No. 27, Series 2015)`, 50, doc.y + y, { align: 'center' });;
            doc.font('public/font/Cambria-Bold.ttf');
            doc.fontSize(11).text(`- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ENTRIES CLOSED - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
`, 20, doc.y, { width: 800 });
            notes[0][0] === undefined ? '' : doc.fontSize(12).text(`${notes[0][0].notes.toUpperCase()}`, 50, doc.y, { align: 'center' });
            //console.log(doc.y);
            if (doc.y > 750) { doc.addPage(); name1() }
            if (copyfor[0] != '' && copyfor[0][0].status == 1) {
                doc.fontSize(12).text(`COPY FOR: ${copyfor[0][0].schoolname.toUpperCase()}`, 50, doc.y + 20, { align: 'center', width: 500 });
                doc.fontSize(12).text(`${copyfor[0][0].schooladdress.toUpperCase()}`, doc.x + 20, doc.y, { align: 'center', width: 500 });
            }
            doc.fontSize(11).text(`Remarks:`, 50, doc.y + 10, { lineGap: 3, continued: true });
            let remarks = '';
            ornumbers[0][0].remarks == '' ? remarks = ' ' : remarks = ornumbers[0][0].remarks.toUpperCase();
            doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`${remarks}`, 73, doc.y, { lineGap: 3 });
            doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text(`Date Issued:`, 50, doc.y, { lineGap: 3, continued: true });
            const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            let date_issued = new Date(ornumbers[0][0].dateissued);
            doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`${months[date_issued.getMonth()]} ${date_issued.getDate() <= 9 ? '0' + date_issued.getDate() : date_issued.getDate()}, ${date_issued.getFullYear()}`, 60, doc.y, { lineGap: 3 });

            doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text('Not Valid Without University Seal', 50, 770);
            doc.rect(doc.x + 20, doc.y + 2, 120, 45).stroke();
            doc.fontSize(10).font('public/font/Cambria-Regular.ttf').text('DOC. STAMP PAID', doc.x + 30, doc.y + 2, { align: 'center', width: 100, lineGap: 3 });
            doc.fontSize(10).font('public/font/Cambria-Regular.ttf').text(`under O.R. No. ${ornumbers[0][0].docstamp}`, doc.x - 25, doc.y, { align: 'center', width: 150, lineGap: 3 });
            doc.fontSize(10).font('public/font/Cambria-Regular.ttf').text(`Date: ${new Date(ornumbers[0][0].docstampdate).toLocaleDateString()}`, doc.x + 25, doc.y, { align: 'center', width: 100, lineGap: 3 });
            //onsole.log(doc.page);
        }
        const TOR_attachment = () => {
            attachment[0].forEach((row) => {
                doc.addPage();
                name1();
                doc.image(path.join(__dirname, `${row.files}`), 80, doc.y - 20, { width: 450, height: 620 });
            });
        }
        const docHeader = () => {
            doc.image(logoPath, 50 * 2, 15, { width: 60 });
            doc.image(logoPath1, 50 * 8.2, 8, { width: 75 });
            doc.font('public/font/Trajan.ttf');
            doc.fontSize(16).fillColor('#0C3E6B').text('SOUTHERN LEYTE', 170, 20);
            doc.fontSize(14).fillColor('#0C3E6B').text('STATE UNIVERSITY', 170, 40);
            doc.font('public/font/Cambria-Regular.ttf').fontSize(7.5).text('Tomas Oppus Campus, San Isidro, Tomas Oppus, Southern Leyte, Philippines', 170, 70 - x);
            doc.fontSize(7.5).fillColor('#0C3E6B').text('Email: tomas_oppus@southernleytestateu.edu.ph', 170, 80 - x);
            doc.fontSize(7.5).fillColor('#0C3E6B').text('Website: www.southernleytestateu.edu.ph', 170, 90 - x);
            doc.fontSize(8).fillColor('black').text('Excellence | Service | Leadership and Good Governance | Innovation | Social Responsibility | Integrity | Professionalism | Spirituality', 72, 90, { align: 'center' });
            doc.fontSize(12).font('public/font/Cambria-Bold.ttf').text('Office of the Registrar', doc.x, doc.y, { align: 'center' })
            doc.fontSize(7.5).font('public/font/Cambria-Regular.ttf').text(' Email: registrar_to@southernleytestateu.edu.ph', 40, doc.y + 5, { continued: true });
            doc.fontSize(7.5).font('public/font/Cambria-Regular.ttf').text(' School Code: 00008056', doc.x + 100, doc.y, { continued: true });
            doc.fontSize(7.5).font('public/font/Cambria-Regular.ttf').text(' Contact No.: +639472921270', doc.x + 100, doc.y);
            doc.lineWidth(.8).moveTo(50, 100).lineTo(550, 100).stroke();
            doc.rect(30, 130, 550, 20).fillColor('#003A75').fill();
            doc.font('public/font/Cambria-Bold.ttf');
            doc.fontSize(14).fillColor('white').text('OFFICIAL TRANSCRIPT OF RECORDS', 50, 131, { align: 'center' });
            doc.font('Times-Roman');

        }
        const docFooter = () => {
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < (range.start + range.count); i++) {
                doc.switchToPage(i);
                docHeader();
                doc.fillColor('black');
                if (range.count > 2) {
                    i == 2 ? '' : doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text('Not Valid Without University Seal', 50, 810);
                } else {
                    i == 0 ? doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text('Not Valid Without University Seal', 50, 810) : '';
                }
                let or_date = new Date(ornumbers[0][0].ordate.toLocaleDateString());
                let day = or_date.getDate() <= 9 ? '0' + or_date.getDate() : or_date.getDate();
                let month = or_date.getMonth() <= 9 ? '0' + (or_date.getMonth() + 1) : or_date.getMonth() + 1
                doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text(`OR No.: ${ornumbers[0][0].ornumber} Date: ${day + '/' + month + '/' + or_date.getFullYear()}`, 50, 830);
                doc.fontSize(11).text(`Page ${i + 1} of ${range.count} pages`, 50, 845, { lineBreak: false });
                doc.fontSize(11).font('public/font/Cambria-Bold.ttf').text('RENATO M. TINDUGAN, MAEd', 400, 830, { width: 150, align: 'center' });
                doc.fontSize(11).font('public/font/Cambria-Regular.ttf').text('Registrar III', 400, 840, { width: 150, align: 'center' });
                doc.lineWidth(1).moveTo(30, 865).lineTo(580, 865).stroke();
                doc.image(document, 50, 875, { width: 120 });
                doc.image(rating, 50 * 5.5, 875, { width: 100 });
                doc.image(iso, 50 * 9, 875, { width: 90 });
            }
        }
        Page01_Content();
        Page02_Content();
        TOR_attachment();
        docFooter();
        doc.end();
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/generateCTC', async (req, res) => {
    const id = req.query.id;
    const logoPath = path.join(__dirname, 'logo.png');
    const logoPath1 = path.join(__dirname, 'logo1.png');
    const document = path.join(__dirname, 'document.png');
    const rating = path.join(__dirname, 'rating.png');
    const iso = path.join(__dirname, 'iso.png');
    let x = 10;
    try {
        const result = await db.query('SELECT * FROM transferred_out_tbl WHERE studentid = ?', [`${id}`]);
        const doc = new pdfdocument({ size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=report.pdf');
        doc.pipe(res);

        /* const docHeader = () => {
            doc.image(logoPath, 50 * 2, 15, { width: 70 });
            doc.image(logoPath1, 50 * 8, 5, { width: 80 });
            doc.font('Times-Roman');
            doc.fontSize(20).text('SOUTHERN LEYTE', 170, 20);
            doc.fontSize(20).text('STATE UNIVERSITY', 170, 35);
            doc.fontSize(10).text('Tomas Oppus Campus', 170, 65 - x);
            doc.fontSize(10).text('Email: tomas_oppus@southernleytestateu.edu.ph', 170, 75 - x);
            doc.fontSize(10).text('Website: www.southernleytestateu.edu.ph', 170, 85 - x);
            doc.fontSize(8.5).text('Excellence | Service | Leadership and Good Governance | Innovation | Social Responsibility | Integrity | Professionalism | Spirituality', 72, 95, { align: 'center' });
            doc.lineWidth(1).moveTo(50, 105).lineTo(550, 105).stroke();
        } */
        const docHeader = () => {
            doc.image(logoPath, 50 * 2, 15, { width: 68 });
            doc.image(logoPath1, 50 * 8, 5, { width: 80 });
            doc.font('public/font/Trajan.ttf');
            doc.fontSize(18).fillColor('#0C3E6B').text('SOUTHERN LEYTE', 170, 20);
            doc.fontSize(16).fillColor('#0C3E6B').text('STATE UNIVERSITY', 170, 40);
            doc.font('public/font/Poppins-SemiBold.ttf').fillColor('black');
            doc.fontSize(7).text('Tomas Oppus Campus', 170, 70 - x);
            doc.font('public/font/Poppins-Regular.ttf');
            doc.fontSize(6).fillColor('#0C3E6B').text('Email: tomas_oppus@southernleytestateu.edu.ph', 170, 80 - x);
            doc.fontSize(6).fillColor('#0C3E6B').text('Website: www.southernleytestateu.edu.ph', 170, 90 - x);
            doc.fontSize(6.5).fillColor('black').text('Excellence | Service | Leadership and Good Governance | Innovation | Social Responsibility | Integrity | Professionalism | Spirituality', 72, 95, { align: 'center' });
            doc.lineWidth(1).moveTo(50, 110).lineTo(550, 110).stroke();
        }

        const docContent = () => {
            doc.moveDown(3);
            doc.fontSize(12).font('Times-Bold').text('OFFICE OF THE REGISTRAR', { align: "center" });
            doc.moveDown(.5);
            doc.fontSize(12).font('Times-Bold').text('CERTIFICATE OF TRANSFER CREDENTIAL', { align: "center" });
            doc.moveDown();

            const options = {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            result[0].forEach((row, index) => {
                doc.font('Times-Roman').fontSize(12)
                    .text(`${new Date(row.informative_date).toLocaleString('en-ASIA', options)}`,
                        { width: 100 * 4.5, align: 'right', underline: true });
                doc.font('Times-Roman').text(`Date`, { width: 100 * 4.3, align: 'right' });
                doc.moveDown();
                doc.font('Times-Bold').text('TO WHOM IT MAY CONCERN:');
                doc.moveDown();
                doc.font('Times-Roman').text(`THIS IS TO CERTIFY that `, { lineGap: 5, indent: 30, continued: true, align: 'justify' });
                doc.font('Times-Bold').text(`${row.lastname}, ${row.firstname} ${row.middlename} `, { continued: true, underline: true });
                doc.font('Times-Roman').text(` a student of this university, is hereby granted Transfer Credential effective this date.`, { underline: false });

                doc.text(`His/Her Official Transcript of Record will be forwarded upon receipt of the request below properly accomplished.`, { indent: 50, lineGap: 5 });
                doc.moveDown();
                doc.font('Times-Bold').text(`RENATO M. TINDUGAN, MAED`, { width: 100 * 4, align: 'right', underline: true });
                doc.font('Times-Roman').text(`Registrar III`, { width: 100 * 3.5, align: 'right' });
                doc.moveDown();

                doc.rect(20, 100 * 3.5, 120, 50).stroke();
                doc.moveDown();
                doc.text('DOC STAMP PAID', 20, 100 * 3.6, { align: 'center', width: 120 });
                doc.fontSize(10).text('under O.R. No.: 0000000 ', { align: 'center', width: 120, height: 50 });
                doc.text('Date: 12/12/2024', { align: 'center', width: 120, height: 50 });
                doc.fontSize(11).text(`-------------------------------------------------- CUT HERE --------------------------------------------------`, 10 * 7, 100 * 3.8)
                doc.moveDown();
                doc.text(`____________________________________________________________________`, { align: 'center' });
                doc.font('Times-Bold').text(`(Name of School)`, { align: 'center' });
                doc.text(`____________________________________________________________________`, { align: 'center' });
                doc.font('Times-Bold').text(`(Address)`, { align: 'center' });
                doc.moveDown();
                doc.text(`_______________`, { width: 100 * 4.5, align: 'right' });
                doc.font('Times-Roman').text(`Date`, { width: 100 * 4.2, align: 'right' });

                doc.font('Times-Bold').text(`The Registrar`);
                doc.text(`SOUTHERN LEYTE STATE UNIVERSITY`);
                doc.fontSize(10).text(`Tomas Oppus Campus, San Isidro, Tomas Oppus Southern Leyte`);
                doc.moveDown(2);
                doc.fontSize(12).text(`Sir/Madam:`);
                doc.moveDown();
                doc.font('Times-Roman').fontSize(12).text(`On the strength of the Transfer Credential issued by your office to `, { indent: 50, lineGap: 5, align: 'justify', continued: true });
                doc.font('Times-Bold').fontSize(12).text(`${row.lastname}, ${row.firstname} ${row.middlename} `, { continued: true, underline: true });
                doc.font('Times-Roman').fontSize(12).text(` on `, { continued: true, underline: false });
                doc.font('Times-Bold').fontSize(12).text(` ${new Date(row.informative_date).toLocaleString('en-ASIA', options)} `, { continued: true, underline: true });
                doc.font('Times-Roman').fontSize(12).text(` we are respectfully requesting his/her Official Transcript of Record `, { underline: false });
                doc.moveDown();
                doc.text(`Very truly yours,`, { width: 100 * 4.2, align: 'right' });
                doc.moveDown();
                doc.text(`____________________`, { width: 100 * 4.4, align: 'right' });
                doc.text(`Registrar`, { width: 100 * 4.1, align: 'right' });
                doc.moveDown();
                let client_status = '';
                row.status == 1 ? client_status = 'Grad. ' + row.yeargraduated : client_status = row.lastsemesterattended + ' ' + row.academicyear
                doc.text(`Course & Yr.: `, { underline: false, continued: true });
                doc.text(`${row.course} - ${client_status}`, { underline: true });
                //doc.lineWidth(1).moveTo(140, 730).lineTo(250, 730).stroke();
                //doc.fontSize(12).text(`${row.firstname} ${row.lastname}`);
            });
        }
        const docFooter = () => {
            doc.image(document, 60, 760, { width: 120 });
            doc.image(rating, 50 * 5.5, 750, { width: 120 });
            doc.image(rating, 50 * 5.5, 750, { width: 120 });
            doc.image(iso, 50 * 9, 750, { width: 110 });
        }

        docHeader();
        docContent();
        docFooter();
        doc.end();
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/generateCTC_v2', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM transferred_out_tbl WHERE studentid = ?', [`${id}`]);
        const doc = new pdfdocument({ size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=report.pdf');
        doc.pipe(res);
        const docContent = () => {
            const options = {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            };
            result[0].forEach((row, index) => {
                doc.font('Times-Roman');
                doc.rect(30, 100 * 3.4, 120, 50).stroke();
                doc.moveDown(-1);
                doc.text('DOC STAMP PAID', 30, 100 * 3.5, { align: 'center', width: 120 });
                doc.fontSize(10).text(`under O.R. No.: ${row.docstamp}`, { align: 'center', width: 120, height: 50 });
                doc.text(`Date: ${new Date(row.docstamp_date).toLocaleDateString()}`, { align: 'center', width: 120, height: 50 });
                let client_status = '';
                row.status == 1 ? client_status = 'Grad. ' + row.yeargraduated : client_status = row.lastsemesterattended + ' ' + row.academicyear;
                doc.fontSize(11).text(` ${row.course} - ${client_status}`, 135, 730);
            });
        }
        docContent();
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        result[0].forEach((row, index) => {
            const name = `${row.lastname}, ${row.firstname} ${row.middlename}`;
            doc.fontSize(11).font('Times-Bold').text(name.toUpperCase(), 250, 240);
            doc.fontSize(11).font('Times-Bold').text(name.toUpperCase(), 65, 622);
            doc.text(`${new Date(row.informative_date).toLocaleString('en-ASIA', options)}`, 275, 622);
            doc.text(`${new Date(row.informative_date).toLocaleString('en-ASIA', options)}`, 430, 170);
            doc.text(`RENATO M. TINDUGAN, MAEd`, 325, 318, { width: 200, align: 'left' });
        })
        doc.end();
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/generateTransmittal', async (req, res) => {

    const id = req.query.id;
    const logoPath = path.join(__dirname, 'logo.png');
    const logoPath1 = path.join(__dirname, 'logo1.png');
    const document = path.join(__dirname, 'document.png');
    const rating = path.join(__dirname, 'rating.png');
    const iso = path.join(__dirname, 'iso.png');
    let x = 10;
    try {
        const result = await db.query('SELECT * FROM transferred_out_tbl WHERE studentid = ?', [`${id}`]);
        const doc = new pdfdocument({ size: 'A4', layout: 'landscape' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=report.pdf');
        doc.pipe(res);

        const docHeader = () => {
            doc.image(logoPath, 50, 15, { width: 60 });
            doc.image(logoPath1, 50 * 6, 5, { width: 70 });
            doc.font('public/font/Trajan.ttf').fillColor('#0C3E6B');
            doc.fontSize(18).text('SOUTHERN LEYTE', 110, 20);  // Position: x=50, y=20
            doc.fontSize(16).text('STATE UNIVERSITY', 110, 36);
            doc.font('public/font/Poppins-SemiBold.ttf').fillColor('black');
            doc.fontSize(7).text('Tomas Oppus Campus', 110, 55);
            doc.font('public/font/Poppins-SemiBold.ttf').fillColor('#0C3E6B');
            doc.fontSize(5).text('Email: tomas_oppus@southernleytestateu.edu.ph', 110, 65);
            doc.fontSize(5).text('Website: www.southernleytestateu.edu.ph', 110, 75);
            doc.fillColor('black');
            doc.fontSize(5.2).text('Excellence | Service | Leadership and Good Governance | Innovation | Social Responsibility | Integrity | Professionalism | Spirituality', 50, 85, { align: 'left' });
            doc.lineWidth(1).moveTo(40, 95).lineTo(405, 95).stroke();
        }
        /* const docHeader = () => {
            doc.image(logoPath, 50 * 2, 15, { width: 68 });
            doc.image(logoPath1, 50 * 8, 5, { width: 80 });
            doc.font('public/font/Trajan.ttf');
            doc.fontSize(18).fillColor('#0C3E6B').text('SOUTHERN LEYTE', 170, 20);
            doc.fontSize(16).fillColor('#0C3E6B').text('STATE UNIVERSITY', 170, 40);
            doc.font('public/font/Poppins-SemiBold.ttf').fillColor('black');
            doc.fontSize(7).text('Tomas Oppus Campus', 170, 70 - x);
            doc.font('public/font/Poppins-Regular.ttf');
            doc.fontSize(6).fillColor('#0C3E6B').text('Email: tomas_oppus@southernleytestateu.edu.ph', 170, 80 - x);
            doc.fontSize(6).fillColor('#0C3E6B').text('Website: www.southernleytestateu.edu.ph', 170, 90 - x);
            doc.fontSize(6.5).fillColor('black').text('Excellence | Service | Leadership and Good Governance | Innovation | Social Responsibility | Integrity | Professionalism | Spirituality', 72, 95, { align: 'center' });
            doc.lineWidth(1).moveTo(50, 110).lineTo(550, 110).stroke();
        } */
        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        const docContent = () => {
            doc.fillColor('black');
            doc.moveDown(2);
            doc.fontSize(12).font('Times-Bold').text('TRANSMITTAL FOR STUDENT OTR/PERMANENT RECORD', { align: "center", width: 345 });
            doc.moveDown();

            result[0].forEach((row, index) => {
                let name = `${row.lastname}, ${row.firstname} ${row.middlename}`;
                doc.fontSize(12).font('Times-Roman');
                doc.text(`${new Date(row.granted_date).toLocaleString('en-ASIA', options)}`, { underline: true });
                doc.text('Date', { align: "center", width: 100 });
                doc.moveDown(2);
                doc.text(capitalizeEveryWord(`${row.schoolname}`), { paragraphGap: 5 });
                doc.text(capitalizeEveryWord(`${row.schooladdress}`));
                doc.lineWidth(1).moveTo(50, 202).lineTo(200, 202).stroke();
                doc.lineWidth(1).moveTo(50, 220).lineTo(200, 220).stroke();
                doc.lineWidth(1).moveTo(50, 235).lineTo(200, 235).stroke();
                doc.lineWidth(1).moveTo(50, 250).lineTo(200, 250).stroke();
                doc.moveDown(4)
                doc.text(`Sir/Madam:`);
                doc.moveDown(2)
                doc.text(`In compliance with your request we are sending the Official Transcript of Records/Secondary Permanent Record of:`,
                    { width: 350, paragraphGap: 5, lineGap: 1 });

                doc.font('Times-Bold').text(name.toUpperCase(), { width: 250, align: 'center', paragraphGap: 5, lineGap: 0, underline: true });
                //doc.lineWidth(1).moveTo(50, 335).lineTo(300, 335).stroke();

                doc.font('Times-Roman').text(`Please acknowledge receipt by sending back to us the right portion of this transmittal.`, { width: 350, paragraphGap: 5, lineGap: 1 });
                doc.moveDown()
                doc.text(`Very truly yours,`);
                doc.moveDown(2);
                doc.font('Times-Bold').text(`RENATO M. TINDUGAN, MAEd`, { underline: true });
                doc.font('Times-Roman').text(`Registrar / Representative`);

                //Left

                doc.lineWidth(1).moveTo(450, 40).lineTo(800, 40).stroke();
                doc.lineWidth(1).moveTo(450, 60).lineTo(800, 60).stroke();
                doc.lineWidth(1).moveTo(450, 80).lineTo(800, 80).stroke();
                doc.fontSize(12).font('Times-Bold').text('ACKNOWLEDGEMENT RECEIPT', 400, 106, { align: "right", width: 330 });
                doc.lineWidth(1).moveTo(450, 150).lineTo(550, 150).stroke();
                doc.font('Times-Roman').text('Date', 440, 155, { align: "center", width: 120 });
                doc.font('Times-Bold').text(`THE REGISTRAR`, 450, 200);
                doc.font('Times-Roman').text(`SLSU - Tomas Oppus Campus`);
                doc.text(`San Isidro, Tomas Oppus, Southern Leyte`);
                doc.moveDown(2);
                doc.text(`Sir/Madam:`);
                doc.moveDown();
                doc.text(`I acknowledge receipt of the Official Transcript of Records/Secondary Permanent Record of Mr/Ms. `, { align: 'justify', continued: true, lineGap: 5 });
                doc.font('Times-Bold').text(` ${name.toUpperCase()}`, { underline: true, continued: true });
                doc.font('Times-Roman').text(` as transmitted on this date `, { underline: false, continued: true });
                doc.font('Times-Bold').text(`${new Date(row.granted_date).toLocaleString('en-ASIA', options)}.`, { underline: true });
                doc.moveDown(2);
                doc.font('Times-Roman');
                doc.text(`Received by:`);
                doc.moveDown();
                doc.text(`_____________________________________`);
                doc.fontSize('11').text(`(Signature over Printed Name)`);
                doc.moveDown();
                doc.text(`_____________________________________`);
                doc.text(`Position`);
                doc.moveDown();
                doc.fontSize('12').text(`Date Received:_________________________`);
            });
        }

        const docFooter = () => {
            //doc.image(document, 50, 755, { width: 130 });
            //doc.image(rating, 50 * 5.5, 750, { width: 120 });
            doc.lineWidth(1).moveTo(40, 520).lineTo(405, 520).stroke();
            doc.image(rating, 50 * 4.5, 530, { width: 80 });
            doc.image(iso, 50 * 6.5, 530, { width: 70 });
        }

        docHeader();
        docContent();
        docFooter();

        //doc.lineWidth(1).moveTo(50, 360).lineTo(300, 360).stroke();
        //doc.lineWidth(1).moveTo(50, 470).lineTo(225, 470).stroke();
        doc.lineWidth(1).moveTo(420, 10).lineTo(420, 600).dash(5, { space: 10 }).stroke();
        doc.end();
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/generateTransmittal_v2', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM transferred_out_tbl WHERE studentid = ?', [`${id}`]);
        const doc = new pdfdocument({ size: 'A4', layout: 'landscape' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=report.pdf');
        doc.pipe(res);

        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        const docContent = () => {


            result[0].forEach((row, index) => {
                doc.font('Times-Roman');
                let name = `${row.lastname}, ${row.firstname} ${row.middlename}`;
                doc.moveDown(5);
                doc.text(`${new Date(row.granted_date).toLocaleString('en-ASIA', options)}`, 40);
                doc.moveDown(2);
                doc.text(row.schoolname.toUpperCase(), { paragraphGap: 5 });
                doc.text(row.schooladdress.toUpperCase());
                doc.moveDown(8.5)
                doc.text(name.toUpperCase());
                doc.text(name.toUpperCase(), 520, 315);
                doc.text(`${new Date(row.granted_date).toLocaleString('en-ASIA', options)}`, 630, 330);
                doc.text(`RENATO M. TINDUGAN, MAEd`, 40, 438);
            });
        }
        docContent();
        doc.end();
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getTORTransactions', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM tortransactions_tbl WHERE studentid = ?', [id]);
        res.json(result[0]);
    } catch (error) {
        console.log(error);
    }
})

app.get('/api/mysql/generateEnvelope', async (req, res) => {
    const id = req.query.id;
    const logoPath = path.join(__dirname, 'logo.png');
    try {
        const result = await db.query('SELECT * FROM transferred_out_tbl WHERE studentid = ?', [`${id}`]);
        const doc = new pdfdocument({ size: [10.48 * 72, 24.13 * 72], layout: 'landscape' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=report.pdf');
        doc.pipe(res);

        const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        const docContent = () => {
            doc.image(logoPath, 50 * 3.2, 30, { width: 140 });
            doc.font('public/font/Trajan.ttf');
            doc.fillColor('#000245');
            doc.fontSize(38).text('SOUTHERN LEYTE', 300, 60);
            doc.fontSize(38).text('STATE UNIVERSITY', 300, 110);
            doc.font('public/font/Cambria-Regular.ttf');
            doc.fontSize(18).text('Tomas Oppus Campus', 710, 60 + 10);
            doc.fontSize(18).text('San Isidro, Tomas Oppus, Southern Leyte', 710, 80 + 10);
            doc.fontSize(18).text('Contact Number: 09463783306', 710, 100 + 10);
            doc.fontSize(18).text('Email: tomas_oppus@southernleytestateu.edu.ph', 710, 120 + 10);
            doc.fillColor('black');
            doc.fontSize(32).text('OFFICE OF THE REGISTRAR', 300, 250);
            doc.font('public/font/Cambria-Regular.ttf');
            doc.fontSize(32).text('registrar_to@southernleytestateu.edu.ph', 300, 270);
            result[0].forEach((row, index) => {
                let middlename = row.middlename;
                let initial = middlename[0];
                let name = `${row.firstname} ${initial}. ${row.lastname}`;
                doc.font('public/font/Cambria-Bold.ttf')
                doc.fontSize(32).text(`THE REGISTRAR`, 850, 450);
                doc.font('public/font/Cambria-Regular.ttf');
                doc.fontSize(32).text(capitalizeEveryWord(`${row.schoolname}`), 850, 480, { paragraphGap: 5 });
                doc.fontSize(32).text(capitalizeEveryWord(`${row.schooladdress}`), 850, 510);

                doc.fontSize(32).text(`Official TOR of ${row.gender == 'Male' ? 'Mr.' : 'Ms.'} ${capitalizeEveryWord(name)}`, 230, 620);
            });
        }
        docContent();
        doc.end();
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.post('/api/mysql/saveEnrollment', async (req, res) => {
    const { fullname, course, major, semester, academicyear, gender, year, purpose, ornumber, docstamp, datepaid, releasedby, datereleased } = req.body;
    try {
        const params = [fullname, course, major, semester, academicyear, gender, year, purpose, ornumber, docstamp, datepaid, releasedby, datereleased];
        const result = await db.query(`INSERT INTO enrollment_tbl (id, fullname, course, major, semester, academicyear, gender, year, purpose, ornumber, docstamp, datepaid, releasedby, datereleased) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`, params);
        res.status(201).json({ message: `Added Sucessfully`, id: result[0].insertId });
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/generateEnrollmentCert', async (req, res) => {
    const id = req.query.id;
    const logoPath = path.join(__dirname, 'logo.png');
    const logoPath1 = path.join(__dirname, 'logo1.png');
    const document = path.join(__dirname, 'document.png');
    const rating = path.join(__dirname, 'rating.png');
    const iso = path.join(__dirname, 'iso.png');
    let x = 9;
    try {
        const result = await db.query('SELECT * FROM `enrollment_tbl` WHERE id = ?', [`${id}`]);
        const doc = new pdfdocument({ size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename=report.pdf');
        doc.pipe(res);

        const docHeader = () => {
            doc.image(logoPath, 50 * 2, 15, { width: 68 });
            doc.image(logoPath1, 50 * 8, 5, { width: 80 });
            doc.font('public/font/Trajan.ttf');
            doc.fontSize(18).fillColor('#0C3E6B').text('SOUTHERN LEYTE', 170, 20);
            doc.fontSize(16).fillColor('#0C3E6B').text('STATE UNIVERSITY', 170, 40);
            doc.font('public/font/Poppins-SemiBold.ttf').fillColor('black');
            doc.fontSize(7).text('Tomas Oppus Campus', 170, 70 - x);
            doc.font('public/font/Poppins-Regular.ttf');
            doc.fontSize(6).fillColor('#0C3E6B').text('Email: tomas_oppus@southernleytestateu.edu.ph', 170, 80 - x);
            doc.fontSize(6).fillColor('#0C3E6B').text('Website: www.southernleytestateu.edu.ph', 170, 90 - x);
            doc.fontSize(6.5).fillColor('black').text('Excellence | Service | Leadership and Good Governance | Innovation | Social Responsibility | Integrity | Professionalism | Spirituality', 72, 95, { align: 'center' });
            doc.lineWidth(1).moveTo(50, 110).lineTo(550, 110).stroke();
        }

        let cert = ['C', 'E', 'R', 'T', 'I', 'F', 'I', 'C', 'A', 'T', 'I', 'O', 'N'];
        let cont = true;
        const docContent = () => {
            doc.moveDown(3);
            for (let i = 0; i < cert.length; i++) {
                if (i == cert.length - 1) {
                    cont = false;
                }
                doc.fontSize(14).font('public/font/Poppins-Bold.ttf').text(`${cert[i]}`, doc.x + 10, doc.y, { underline: true, continued: cont, align: 'center', width: 300 });
            }

            doc.moveDown();
            doc.fontSize(10).font('public/font/Poppins-Regular.ttf').text('TO WHOM IT MAY CONCERN:', doc.x + 20, doc.y);
            doc.moveDown();
            result[0].forEach((row, index) => {
                let sem = '';
                switch (row.semester) {
                    case '1':
                        sem = '1st Semester';
                        break;
                    case '2':
                        sem = '2nd Semester';
                        break;
                    case '3':
                        sem = 'Summer';
                        break;
                }
                let pronoun = row.gender == 'Male' ? 'He' : 'She';
                let gender_prefix = row.gender == 'Male' ? 'Mr.' : 'Ms.'
                let course = '';
                switch (row.course) {
                    case 'BSIT':
                        course = 'Bachelor of Science in Information Technology';
                        break;
                    case 'BSBA':
                        course = 'Bachelor of Science in Business Administration';
                        break;
                    case 'BEED':
                        course = 'Bachelor of Elementary Education';
                        break;
                    case 'BSED':
                        course = 'Bachelor of Secondary Education';
                        break;
                    case 'BPED':
                        course = 'Bachelor of Physical Education';
                        break;
                    case 'MAED':
                        course = 'Master of Arts in Education';
                        break;
                }
                let year_status = '';
                switch (row.year) {
                    case '1':
                        year_status = '1st-year';
                        break;
                    case '2':
                        year_status = '2nd-year';
                        break;
                    case '3':
                        year_status = '3rd-year';
                        break;
                    case '4':
                        year_status = '4th-year';
                        break;
                }
                doc.font('public/font/Poppins-Regular.ttf').text(`Certify that `, doc.x, doc.y,
                    { paragraphGap: 5, indent: 30, lineGap: 0, continued: true, align: 'justify' });
                doc.font('public/font/Poppins-Bold.ttf').text(`${gender_prefix.toUpperCase()} ${row.fullname.toUpperCase()} `,
                    { continued: true });
                doc.font('public/font/Poppins-Regular.ttf').text(`is officially enrolled as a bona fide student at`, { continued: true });
                doc.font('public/font/Poppins-Bold.ttf').text(` SOUTHERN LEYTE STATE UNIVERSITY-TOMAS OPPUS CAMPUS`, { continued: true });
                doc.font('public/font/Poppins-Regular.ttf').text(` for the `, { continued: true });
                doc.font('public/font/Poppins-Bold.ttf').text(`${sem},`, { continued: true });
                doc.font('public/font/Poppins-Bold.ttf').text(` AY ${row.academicyear}. ${pronoun} `, { continued: true });
                doc.font('public/font/Poppins-Regular.ttf').text(`is currently taking up a `, { continued: true });
                doc.font('public/font/Poppins-Bold.ttf').text(` ${course.toUpperCase()}`, { continued: true });
                doc.font('public/font/Poppins-Regular.ttf').text(` under the `, { continued: true });
                doc.font('public/font/Poppins-Bold.ttf').text(` ${row.major.toUpperCase()} AREA `, { continued: true });
                doc.font('public/font/Poppins-Regular.ttf').text(` and enrolled as a `, { continued: true });
                doc.font('public/font/Poppins-Bold.ttf').text(` ${year_status}`, { continued: true });
                doc.font('public/font/Poppins-Regular.ttf').text(` student.`);
                doc.moveDown();
                doc.font('public/font/Poppins-Regular.ttf').text(`This certification is issued upon the request of `, { paragraphGap: 5, indent: 30, align: 'justify', continued: true });
                doc.font('public/font/Poppins-Bold.ttf').text(` ${gender_prefix.toUpperCase()} ${row.fullname.toUpperCase()}  `, { continued: true });
                doc.font('public/font/Poppins-Regular.ttf').text(`on the `, { continued: true });
                const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                let date = new Date(row.datepaid);
                let x = '';
                if (date.getDate() > 3) {
                    x = date.getDate() + 'th';
                }
                doc.font('public/font/Poppins-Bold.ttf').text(` ${x} of ${months[date.getMonth()].toUpperCase()} ${date.getFullYear()}`, { continued: true });
                doc.font('public/font/Poppins-Regular.ttf').text(` for `, { continued: true });
                doc.font('public/font/Poppins-Bold.ttf').text(`${row.purpose.toUpperCase()}.`);
                doc.moveDown();
                doc.font('public/font/Poppins-Regular.ttf').text(`Should you require further verification, please get in touch with our office at SLSU-Tomas Oppus Campus Office of the Registrar.`, { paragraphGap: 5, indent: 30, lineGap: 0, align: 'justify' });
                doc.moveDown(3);
                let released_by = '';
                let initials = '';
                switch (row.releasedby) {
                    case 'Marcelo':
                        released_by = 'Marcelo B. Palero';
                        initials = 'mbp';
                        break;
                    case 'Kim':
                        released_by = 'Kimberly Q. Calope, MM';
                        initials = 'kqc';
                        break;
                    case 'Rolando':
                        released_by = 'Rolando K. Sala Jr.';
                        initials = 'rks';
                        break;
                }
                doc.fontSize(12).font('public/font/Poppins-Bold.ttf').text(`${released_by.toUpperCase()}`, doc.x * 3, doc.y, { align: 'center' });
                doc.fontSize(7).font('public/font/Poppins-Regular.ttf').text(`Registrar/Authorized Representative`, doc.x, doc.y, { align: 'center' });
                doc.moveDown();
                doc.fontSize(8).font('public/font/Poppins-Regular.ttf').text(`Not valid 
without 
the school seal`, 80, doc.y + 50, { width: 80, align: 'center' });
                let paid_date = new Date(row.datepaid);
                let y = paid_date.getDate() < 10 ? '0' + paid_date.getDate() : paid_date.getDate();
                let z = paid_date.getMonth() < 10 ? '0' + (paid_date.getMonth() + 1) : paid_date.getMonth();
                doc.fontSize(8).font('public/font/Poppins-Regular.ttf').text(`O.R No.`, doc.x + 10, doc.y, { width: 80, align: 'left', continued: true });
                doc.fontSize(8).font('public/font/Poppins-Bold.ttf').text(`${row.ornumber}`, doc.x, doc.y, { width: 80, align: 'left' });
                doc.fontSize(8).font('public/font/Poppins-Bold.ttf').text(`${z}/${y}/${paid_date.getFullYear()} ${initials}`, doc.x, doc.y, { width: 80, align: 'left' });

                doc.fontSize(8).font('public/font/Poppins-Regular.ttf').text(`Doc Stamp PAID under`, doc.x - 10, doc.y + 20, { width: 100, align: 'center' });
                doc.fontSize(8).font('public/font/Poppins-Regular.ttf').text(`O.R. No. `, doc.x + 15, doc.y, { width: 100, align: 'left', continued: true });
                doc.fontSize(8).font('public/font/Poppins-Bold.ttf').text(`${row.docstamp}`, doc.x, doc.y, { width: 100, align: 'left' });
                doc.fontSize(8).font('public/font/Poppins-Regular.ttf').text(`Date: `, doc.x, doc.y, { width: 100, align: 'left', continued: true });
                doc.fontSize(8).font('public/font/Poppins-Bold.ttf').text(`${z}/${y}/${paid_date.getFullYear()}`, doc.x, doc.y, { width: 100, align: 'left' });
                doc.rect(doc.x - 20, doc.y - 40, 110, 45).stroke();
            });
        }
        const docFooter = () => {
            doc.lineWidth(1).moveTo(50, 740).lineTo(550, 740).stroke();
            //doc.image(document, 60, 760, { width: 120 });
            // doc.image(rating, 50 * 5.5, 750, { width: 120 });
            doc.image(rating, 50 * 5.5, 750, { width: 120 });
            doc.image(iso, 50 * 8.5, 750, { width: 110 });
        }

        docHeader();
        docContent();
        docFooter();
        /* const options = {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }; */
        /* result[0].forEach((row, index) => {
            const name = `${row.lastname}, ${row.firstname} ${row.middlename}`;
            doc.text(name.toUpperCase(), 250, 250, {});
            doc.text(name.toUpperCase(), 70, 600);
            doc.text(`${new Date(row.informative_date).toLocaleString('en-ASIA', options)}`, 310, 600);
        }) */
        doc.end();
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getEnrollmentCertList', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM enrollment_tbl ORDER BY datereleased ASC');
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getStudentList', async (req, res) => {
    try {
        const result = await db.query('SELECT personalbackground_tbl.studentid, personalbackground_tbl.lastname, personalbackground_tbl.firstname, personalbackground_tbl.middlename, admission_tbl.course FROM personalbackground_tbl JOIN admission_tbl ON personalbackground_tbl.studentid = admission_tbl.student_id ORDER BY lastname ASC;');
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getDiplomaList', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM diploma_tbl ORDER BY lastname ASC;');
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/searchDiploma', async (req, res) => {
    const searchQuery = req.query.search;
    ;
    try {
        const result = await db.query(`SELECT * FROM diploma_tbl WHERE firstname LIKE ? OR lastname LIKE ? OR middlename LIKE ? ORDER BY lastname ASC`,
            [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/getDiplomaInfo', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM diploma_tbl WHERE id = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});


app.get('/api/mysql/checkClientID', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT * FROM transferred_out_tbl WHERE studentid = ?;`,
            [`${searchQuery}`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/getStudentPersonalBackground', async (req, res) => {
    const id = req.query.id;
    let image = '';
    try {
        const result = await db.query('SELECT * FROM personalbackground_tbl WHERE studentid = ?', [`${id}`]);
        result[0][0].photo != '' ? image = `http://${getLocalIP()}:3001/${result[0][0].photo}` : image;
        const results = {
            data: result[0],
            image: image,
        }
        res.json(results);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getStudentAdmissionInformation', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM admission_tbl WHERE student_id = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getStudentOtherInformation', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM otherinformation_tbl WHERE studentid = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getStudentEducationInformation', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM educationalbackground_tbl WHERE studentid = ?', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getStudentSemesters', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT semester,academicyear, course, major FROM subjectstaken_tbl WHERE studentid = ? GROUP BY academicyear, semester ORDER BY academicyear ASC', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getStudentSubjectsTaken', async (req, res) => {
    const id = req.query.id;
    try {
        const result = await db.query('SELECT * FROM subjectstaken_tbl WHERE studentid = ? ORDER BY academicyear ASC', [`${id}`]);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getAcademicYear', async (req, res) => {
    try {
        const result = await db.query(`SELECT academicyear FROM transferred_out_tbl WHERE academicyear != ' ' AND academicyear != 'Empty' GROUP BY academicyear ORDER BY academicyear DESC;`);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.post('/api/mysql/receivedINC', async (req, res) => {
    const { date, student_id, student_name, course_no, descriptive_title, semester, date_complied, rating, instructor, academic_year, ornumber, datepaid } = req.body;
    try {
        const params = [date, student_id, student_name, course_no, descriptive_title, semester, date_complied, rating, instructor, academic_year, ornumber, datepaid];
        const result = await db.query(`INSERT INTO inc_transaction_tbl (id, date, student_id, student_name, course_no, descriptive_title, semester, date_complied, rating, instructor, academic_year, ornumber, datepaid) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, params);
        res.status(201).json({ message: 'Added Sucessfully', userId: result.insertId });
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.put('/api/mysql/updateINC', async (req, res) => {
    const { id, student_id, student_name, course_no, descriptive_title, semester, date_complied, rating, instructor, academic_year, ornumber, datepaid } = req.body;
    try {
        const result = await db.query(`UPDATE inc_transaction_tbl SET student_id = ?, student_name = ?, course_no = ?, descriptive_title = ?, semester = ?, date_complied = ?, rating = ?, instructor = ?, academic_year = ?, ornumber = ?, datepaid = ? WHERE inc_transaction_tbl.id = ?;`, [student_id, student_name, course_no, descriptive_title, semester, date_complied, rating, instructor, academic_year, ornumber, datepaid, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.put('/api/mysql/updateReturnedDate', async (req, res) => {
    const { id, returneddate, receiveddate } = req.body;
    try {
        const result = await db.query(`UPDATE transferred_out_tbl SET returned_date = ?, received_date = ? WHERE studentid = ?;`, [returneddate, receiveddate, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getReceivedINC', async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM inc_transaction_tbl;`);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/searchINC', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT * FROM inc_transaction_tbl WHERE student_name LIKE ? OR student_id LIKE ?`, [`%${searchQuery}%`, `%${searchQuery}%`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/getSettings', async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM settings;`);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.put('/api/mysql/updateSettings', async (req, res) => {
    const { ctc_version, gtc_version } = req.body;
    try {
        const result = await db.query(`UPDATE settings SET ctc_print_v1 = ?, gtc_print_v1 = ? WHERE id = 1`, [ctc_version, gtc_version]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/getNSTPList', async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM nstp_tbl;`);
        res.json(result[0]);
    } catch (error) {
        console.error('Error fetching request data:', error);
        res.status(400).json({ message: 'Internal Server Error' });
    }
});

app.get('/api/mysql/searchNSTPData', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT * FROM nstp_tbl WHERE firstname LIKE ? OR lastname LIKE ? OR middlename LIKE ? ORDER BY lastname ASC`,
            [`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }

});

app.get('/api/mysql/getCurrentTransferCount', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT COUNT( CASE WHEN transfer_status = 2 THEN 1 END ) AS granted, COUNT( CASE WHEN transfer_status = 1 THEN 1 END ) AS informative FROM transferred_out_tbl WHERE informative_date = CURDATE() OR granted_date = CURDATE();`);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/getINCReceivedCount', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT COUNT(*) AS count FROM inc_transaction_tbl`);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/getSchoolTransferredCount', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT schoolname, COUNT(*) AS transfer_count FROM transferred_out_tbl WHERE transfer_status = 2 GROUP BY schoolname ORDER BY transfer_count DESC;`);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/getSchoolNameTransferredList', async (req, res) => {
    try {
        const result = await db.query(`SELECT schoolname FROM transferred_out_tbl WHERE transfer_status = 2 GROUP BY schoolname ORDER BY schoolname ASC;`);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.get('/api/mysql/getSchoolAddressTransferredList', async (req, res) => {
    const searchQuery = req.query.search;
    try {
        const result = await db.query(`SELECT schoolname, schooladdress FROM transferred_out_tbl WHERE transfer_status = 2 AND schoolname = ? GROUP BY schoolname;`, [`${searchQuery}`]);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

app.put('/api/mysql/addNotes/:id', async (req, res) => {
    const { id, notes } = req.body;
    try {
        const result = await db.execute('UPDATE request_tbl SET notes = ? WHERE id= ?', [notes, id]);
        res.status(201).json({ message: 'Status Updated', result });

    } catch (error) {
        console.log(error);
    }
});

app.post('/api/mysql/addShiftee', async (req, res) => {
    const { studentid, name, semester, academicyear, currentcourse, currentmajor, newcourse, newmajor, dateadded } = req.body;
    try {
        const params = [studentid, name, semester, academicyear, currentcourse, currentmajor, newcourse, newmajor, dateadded];
        const result = db.execute('INSERT INTO `shiftee_tbl` (`id`, `studentid`, `name`, `semester`, `academicyear`, `currentcourse`, `currentmajor`, `newcourse`, `newmajor`, `dateadded`) VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?);', params);
        res.status(201).json({ message: 'Added Sucessfully' });
    } catch (error) {
        console.log(error)
    }
});
app.get('/api/mysql/getShifteeList', async (req, res) => {
    try {
        const result = await db.query(`SELECT * FROM shiftee_tbl ORDER BY dateadded DESC`);
        res.json(result[0]);
    } catch (error) {
        console.log('Error searching: ', error);
    }
});

/* app.put('/api/mysql/updateAdmissionInformation', async (req, res) => {
    const { id, admission_date, entrance_credential, course, major } = req.body;
    try {
        const result = await db.execute('UPDATE admission_tbl SET admission_date = ?, entrance_credential = ?, course = ?, major = ? WHERE student_id= ?', [admission_date, entrance_credential, course, major, id]);
        res.status(201).json({ message: 'Status Updated', result });

    } catch (error) {
        console.log(error);
    }
}); */

app.put('/api/mysql/updateAdmissionInformation', async (req, res) => {
    const { id, admission_date, entrance_credential, course, major } = req.body;
    try {
        const result = await db.execute('UPDATE admission_tbl SET admission_date = ?, entrance_credential = ?, course = ?, major = ? WHERE student_id= ?', [admission_date, entrance_credential, course, major, id]);
        res.status(201).json({ message: 'Status Updated', result });

    } catch (error) {
        console.log(error);
    }
});

app.put('/api/mysql/updatePersonalBackground', async (req, res) => {
    const { id, birthdate, birthplace, sex, citizenship, religion, parentguardian, permanentaddress } = req.body;
    try {
        const result = await db.execute('UPDATE personalbackground_tbl SET birthdate = ?, birthplace = ?, sex = ?, citizenship = ?, religion= ?, parentguardian = ?, permanentaddress = ? WHERE studentid= ?', [birthdate, birthplace, sex, citizenship, religion, parentguardian, permanentaddress, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.log(error);
    }
});
app.put('/api/mysql/updateName', async (req, res) => {
    const { id, firstname, middlename, lastname } = req.body;
    try {
        const result = await db.execute('UPDATE personalbackground_tbl SET firstname = ?, middlename = ?, lastname = ? WHERE studentid= ?', [firstname, middlename, lastname, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.log(error);
    }
});

app.put('/api/mysql/updateOtherInformation', async (req, res) => {
    const { id, nstpserialnumber, notes } = req.body;
    try {
        const result = await db.execute('UPDATE otherinformation_tbl SET nstpserialnumber = ?, notes = ? WHERE studentid= ?', [nstpserialnumber, notes, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.log(error);
    }
});

app.post('/api/mysql/insertOtherInformation', async (req, res) => {
    const { id, nstpserialnumber, notes } = req.body;
    try {
        const result = await db.execute('INSERT INTO `otherinformation_tbl` (`id`, `studentid`, `nstpserialnumber`,`notes`) VALUES (NULL, ?, ?, ?);', [id, nstpserialnumber, notes]);
        res.status(201).json({ message: 'Data Saved', result });
    } catch (error) {
        console.log(error);
    }
});

app.put('/api/mysql/updateEducationalBackground', async (req, res) => {
    const { id, elementaryschool, elementaryaddress, elementaryyeargraduated, secondaryschool, secondaryaddress, secondaryyeargraduated, tertiaryschool, tertiaryaddress, tertiaryyeargraduated } = req.body;
    try {
        const result = await db.execute('UPDATE educationalbackground_tbl SET elementaryschool = ?, elementaryaddress = ?, elementaryyeargraduated = ?, secondaryschool = ?, secondaryaddress = ?, secondaryyeargraduated = ?, tertiaryschool = ?, tertiaryaddress = ?, tertiaryyeargraduated = ? WHERE studentid= ?', [elementaryschool, elementaryaddress, elementaryyeargraduated, secondaryschool, secondaryaddress, secondaryyeargraduated, tertiaryschool, tertiaryaddress, tertiaryyeargraduated, id]);
        res.status(201).json({ message: 'Status Updated', result });
    } catch (error) {
        console.log(error);
    }
});

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const config of iface) {
            if (config.family === "IPv4" && !config.internal) {
                return config.address; // Return the first found non-internal IPv4 address
            }
        }
    }
    return "127.0.0.1"; // Fallback
}

app.listen(PORT, () => {
    console.log(`Server is running ${getLocalIP()}:${PORT}`);
})