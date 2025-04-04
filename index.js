import express from "express";
import db  from './db.js';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());
const PORT = 3000;

// Get users
app.get('/get-users', (req, res) => {
    const query = "SELECT * FROM accounts";
    db.query(query)
        .then(users => {
            res.status(200).json({ users: users.rows });
        });
});

app.post('/check-user', (req, res) => {
    const { username, password } = req.body;

    const query = "SELECT * FROM accounts WHERE username=$1 AND password=$2";
    db.query(query, [username, password])
        .then(result => {
            if (result.rowCount > 0) {
                res.status(200).json({ exist: true, message: "login successful" });
            } else {
                res.status(200).json({ exist: false, message: "Invalid username or password" });
            }
        });
});

app.post('/register', (req, res) => {
    const { username, password, fname, lname } = req.body;

    const query = "INSERT INTO accounts (username, password, fname, lname) VALUES ($1, $2, $3, $4)";
    db.query(query, [username, password, fname, lname])
        .then(result => {
            res.status(200).json({ success: true });
        });
});

// Get titles (only those that are not marked as done)
app.get('/get-titles', (req, res) => {
    const query = "SELECT * FROM titles WHERE status = false";  // Only fetch titles with status = false
    db.query(query)
        .then(titles => {
            res.status(200).json({ titles: titles.rows });
        })
        .catch(error => {
            console.error("Error fetching titles:", error);
            res.status(500).json({ message: 'Error fetching titles' });
        });
});

// Get all lists
app.get('/get-lists', (req, res) => {
    const query = "SELECT * FROM lists";
    db.query(query)
        .then(lists => {
            res.status(200).json({ lists: lists.rows });
        });
});

// Home route
app.get('/', (req, res) => {
    res.send('HELLO WORLD');
});

// To-do homepage route
app.get('/to-do', (req, res) => {
    res.send('This is to do homepage');
});

// Add new To-Do with tasks
app.post('/add-to-do', (req, res) => {
    const { username, title, lists } = req.body;
    const date_modified = new Date().toISOString();
    const status = false;

    console.log("Request Body: ", req.body);

    if (!Array.isArray(lists) || lists.length === 0) {
        return res.status(400).json({ success: false, message: "Lists must be a non-empty array" });
    }

    const titleQuery = "INSERT INTO titles (username, title, date_modified, status) VALUES ($1, $2, $3, $4) RETURNING id";

    db.query(titleQuery, [username, title, date_modified, status])
        .then(result => {
            const title_id = result.rows[0].id;

            console.log("Inserted Title ID: ", title_id);

            const listQueries = lists.map((task, index) => {
                console.log(`Inserting list ${index + 1}:`, task);
                return db.query("INSERT INTO lists (title_id, list_desc, status) VALUES ($1, $2, $3)", [title_id, task, status]);
            });

            return Promise.all(listQueries);
        })
        .then(() => {
            res.status(200).json({ success: true, message: "To-Do List added successfully" });
        })
        .catch(error => {
            console.error(error);
            res.status(500).json({ success: false, message: "Error adding To-Do List" });
        });
});

// Update To-Do: update tasks in the list for a given title
app.post('/update-todo', (req, res) => {
    const { title_id, list } = req.body;
    const date_modified = new Date().toISOString().split('T')[0];

    const updateTitleQuery = "UPDATE titles SET date_modified = $1 WHERE id = $2";
    db.query(updateTitleQuery, [date_modified, title_id])
        .then(() => {
            const deleteListsQuery = "DELETE FROM lists WHERE title_id = $1";
            return db.query(deleteListsQuery, [title_id]);
        })
        .then(() => {
            const insertListQueries = list.map(task =>
                db.query("INSERT INTO lists (title_id, list_desc, status) VALUES ($1, $2, true)", [title_id, task])
            );
            return Promise.all(insertListQueries);
        })
        .then(() => {
            res.status(200).json({ success: true, message: "To-do Successfully Updated" });
        })
        .catch(error => {
            console.error(error);
            res.status(500).json({ success: false, message: "Error updating To-Do List" });
        });
});

// Delete To-Do: delete a title and all its associated tasks
app.post('/delete-todo', (req, res) => {
    const { title_id } = req.body;

    const deleteListsQuery = "DELETE FROM titles WHERE id = $1";
    db.query(deleteListsQuery, [title_id])
        .then(() => {
            const deleteTitleQuery = "DELETE FROM lists WHERE title_id = $1";
            return db.query(deleteTitleQuery, [title_id]);
        })
        .then(() => {
            res.status(200).json({ success: true, message: "To-do Successfully Deleted" });
        })
        .catch(error => {
            console.error(error);
            res.status(500).json({ success: false, message: "Error deleting To-Do List" });
        });
});

// Get lists by titleId
app.get('/get-lists/:titleId', async (req, res) => {
    const titleId = req.params.titleId;

    try {
        // Query to get the title
        const titleQuery = 'SELECT * FROM titles WHERE id = $1'; // Using parameterized queries
        const titleResult = await db.query(titleQuery, [titleId]);

        if (titleResult.rows.length === 0) {
            return res.status(404).json({ message: 'Title not found' });
        }

        const title = titleResult.rows[0]; // Get the title details

        // Query to get the lists associated with the titleId
        const listsQuery = 'SELECT * FROM lists WHERE title_id = $1'; // Again, using parameterized queries
        const listsResult = await db.query(listsQuery, [titleId]);

        if (listsResult.rows.length === 0) {
            return res.status(404).json({ message: 'No lists found for this title' });
        }

        // Return the title and lists in the response
        res.json({
            title: title.title,  // The title text from titles table
            lists: listsResult.rows,  // The lists associated with the title from the lists table
        });

    } catch (error) {
        console.error('Error fetching lists:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

// Update task status for a given taskId
app.put('/update-task-status/:taskId', async (req, res) => {
    const { taskId } = req.params;
    const { status } = req.body;

    try {
        const updatedTask = await db.query(
            "UPDATE lists SET status = $1 WHERE id = $2 RETURNING *",
            [status, taskId]
        );

        if (updatedTask.rowCount === 0) {
            return res.status(404).send({ message: 'Task not found' });
        }

        res.status(200).send({ message: 'Task status updated successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ message: 'Internal server error', error: error.message });
    }
});

// Update title status (to move the title to "Done")
// The title status is not updated for a title if all tasks are completed
app.put('/update-title-status/:titleId', async (req, res) => {
    const { titleId } = req.params;
    const { status } = req.body;

    try {
        const updatedTitle = await db.query(
            "UPDATE titles SET status = $1 WHERE id = $2 RETURNING *",
            [status, titleId]
        );

        if (updatedTitle.rowCount === 0) {
            return res.status(404).send({ message: 'Title not found' });
        }

        res.status(200).send({ message: 'Title status updated to done successfully' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ message: 'Internal server error', error: error.message });
    }
});

// Update Title: Update only the title text (does not affect other columns like status)
app.put('/edit-title/:titleId', async (req, res) => {
    const { titleId } = req.params;
    const { title, status } = req.body;  // Get title and status from request body

    // If the status is not provided, set it to a default (e.g., 'false' or 'pending')
    const newStatus = status !== undefined ? status : false;

    // Update the title in the titles table
    try {
        const updatedTitle = await db.query(
            "UPDATE titles SET title = $1, status = $2, date_modified = $3 WHERE id = $4 RETURNING *",
            [title, newStatus, new Date().toISOString(), titleId]
        );

        if (updatedTitle.rowCount === 0) {
            return res.status(404).json({ message: 'Title not found' });
        }

        res.status(200).json({ message: 'Title updated successfully', title: updatedTitle.rows[0] });
    } catch (error) {
        console.error('Error updating title:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});

app.post('/delete-task', (req, res) => {
    console.log("Received request body:", req.body); // Debugging

    const { listIds } = req.body; // Expecting an array

    if (!listIds || listIds.length === 0) {
        return res.status(400).json({ success: false, message: "List IDs are required." });
    }

    db.query("DELETE FROM lists WHERE id = ANY($1)", [listIds])
    .then(() => {
        console.log("Deleted tasks:", listIds);
        res.json({ success: true, message: "Selected lists deleted successfully!" });
    })
    .catch(error => {
        console.error("Database error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error." });
    });
});

app.post('/update-task', (req, res) => {
    const { task_id, new_desc } = req.body;

    if (!task_id || !new_desc) {
        return res.status(400).json({ success: false, message: "Task ID and new description are required." });
    }

    db.query("UPDATE lists SET list_desc = $1 WHERE id = $2", [new_desc, task_id])
    .then(() => res.json({ success: true, message: "Task updated successfully!" }))
    .catch(error => {
        console.error("Database error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error." });
    });
});

app.post('/add-task', async (req, res) => {
    console.log("Received Request Body:", req.body); // ✅ Debugging log

    const { title_id, list_desc, status } = req.body;

    if (!title_id || !list_desc || list_desc.trim() === "") {
        return res.status(400).json({ success: false, message: "Task ID and List description are required." });
    }

    try {
        const result = await db.query(
            "INSERT INTO lists (title_id, list_desc, status) VALUES ($1, $2, $3) RETURNING id",
            [title_id, list_desc, status]
        );

        res.json({ success: true, message: "List added successfully!", list_id: result.rows[0].id });
    } catch (error) {
        console.error("Database error:", error);
        res.status(500).json({ success: false, message: "Internal Server Error." });
    }
});



app.listen(PORT, () => {
    console.log(`Server is running on Port ${PORT}`);
});
