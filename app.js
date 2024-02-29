// server.js

const express = require('express');
const mysql = require('mysql');
var cors = require('cors')
const { createClient } = require('redis');
const client = createClient({
    url: 'redis://default:461d74ad435648879093da4a18991e2e@driven-marlin-41631.upstash.io:41631'
});
const app = express();
const port = 3000;
app.use(cors())
// MySQL database configuration
const dbConfig = {
    host: 'databaseblogs.cfqe2e6c4k8b.ap-south-1.rds.amazonaws.com',
    user: 'admin',
    password: '07Aman05!!',
    database: 'databaseblogs',
    port: 3306
};

client.on('error', function (err) {
    console.error('Redis connection error:', err);
});

const connection = mysql.createConnection(dbConfig);

// Connect to the MySQL database
connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err);
        return;
    }
    console.log('Connected to MySQL database');

    // Create 'blogs' table if not present
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS blogs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            views INT DEFAULT 0
        )
    `;
    connection.query(createTableQuery, (err, result) => {
        if (err) {
            console.error('Error creating blogs table:', err);
            return;
        }
        console.log('Table "blogs" created (if not present)');
    });



    const sql = 'SELECT * FROM blogs ORDER BY views DESC LIMIT 5';

    connection.query(sql, (err, rows) => {
        if (err) {
            console.error('Error fetching top 5 blogs from MySQL:', err);
            return;
        }
        console.log('Top 5 blogs fetched from MySQL:');

        // Convert the rows into a format suitable for caching in Redis
        const blogsToCache = rows.map(row => ({
            id: row.id,
            name: row.name,
            title: row.title,
            content: row.content,
            views: row.views
        }));

        // Store the top 5 blogs in Redis
        client.connect()
        console.log('Connected to Redis');
        client.set('top5blogs', JSON.stringify(blogsToCache), (err, reply) => {
            if (err) {
                console.error('Error caching top 5 blogs in Redis:', err);
                return;
            }
            console.log('Top 5 blogs cached in Redis:', reply);
        });
    });
});

// Middleware to parse JSON bodies
app.use(express.json());

// Endpoint to store data in the database
app.post('/post-data', (req, res) => {
    const { author, title, content } = req.body;
    const sql = 'INSERT INTO blogs (name, title, content, views) VALUES (?, ?, ?, 0)';
    connection.query(sql, [author, title, content], (err, result) => {
        if (err) {
            console.error('Error inserting data into MySQL database:', err);
            res.status(500).send('Error inserting data');
            return;
        }
        console.log('Data inserted successfully:', result);
        res.status(200).send('Data inserted successfully');
    });
});

// Endpoint to retrieve data from the database
app.get('/get-data', (req, res) => {
    const sql = 'SELECT * FROM blogs';
    connection.query(sql, (err, rows) => {
        if (err) {
            console.error('Error retrieving data from MySQL database:', err);
            res.status(500).send('Error retrieving data');
            return;
        }
        console.log('Data retrieved successfully:', rows);
        res.status(200).json(rows);
    });
});


app.get('/get-data/:id', async (req, res) => {
    try {
        // Attempt to retrieve the blog post from Redis
        const cachedBlogPost = await client.get('top5blogs');

        const blogId = req.params.id;
        const blogIdString = String(blogId).trim();

        // Check if the blog post is found in Redis cache



        if (cachedBlogPost) {
            // If the blog post is found in Redis cache, return it
            const blogPost = JSON.parse(cachedBlogPost);
            console.log('Data retrieved from Redis cache:', blogPost);
            const ids = blogPost.map(blog => blog.id);
            const idsStringArray = ids.map(id => String(id).trim());
            const isBlogIdInIds = idsStringArray.includes(blogIdString);

            if (!isBlogIdInIds) {
                const sql = 'SELECT * FROM blogs WHERE id = ?';
                connection.query(sql, [blogId], (err, rows) => {
                    if (err) {
                        console.error('Error retrieving data from MySQL database:', err);
                        res.status(500).send('Error retrieving data');
                        return;
                    }
                    if (rows.length === 0) {
                        res.status(404).send('Blog post not found');
                        return;
                    }
                    const blogPost = rows[0];
                    console.log('Data retrieved from MySQL database:', blogPost);

                    // Cache the retrieved blog post in Redis

                    res.status(200).json(blogPost);
                });
            } else {
                // If the blog post is found in Redis cache, return it
                console.log('Data retrieved from Redis cache:', JSON.parse(cachedBlogPost));

                const uniqueBlogPost = JSON.parse(cachedBlogPost).find(blog => String(blog.id).trim() === blogIdString);
                console.log('Data retrieved from Redis cache:', uniqueBlogPost);
                res.status(200).json(uniqueBlogPost);
            }

        } else {
            // If the blog post is not found in Redis cache, query the MySQL database
            const sql = 'SELECT * FROM blogs WHERE id = ?';
            connection.query(sql, [blogId], (err, rows) => {
                if (err) {
                    console.error('Error retrieving data from MySQL database:', err);
                    res.status(500).send('Error retrieving data');
                    return;
                }
                if (rows.length === 0) {
                    res.status(404).send('Blog post not found');
                    return;
                }
                const blogPost = rows[0];
                console.log('Data retrieved from MySQL database:', blogPost);

                // Cache the retrieved blog post in Redis

                res.status(200).json(blogPost);
            });
        }
    } catch (error) {
        console.error('Error retrieving data:', error);
        res.status(500).send('Error retrieving data');
    }
});


app.put('/update-views/:id', (req, res) => {
    const blogPostId = req.params.id; // Extract the blog post ID from the request parameters

    // Define the SQL query to update views for the specified blog post ID
    const sql = 'UPDATE blogs SET views = IFNULL(views, 0) + 1 WHERE id = ?';

    // Execute the SQL query
    connection.query(sql, [blogPostId], (err, result) => {
        if (err) {
            console.error('Error updating views for blog post:', err);
            res.status(500).send('Error updating views');
            return;
        }
        console.log('Views updated successfully');
        res.status(200).send('Views updated successfully');
    });
});


// Define an API endpoint to add the 'views' column to the 'blogs' table
app.all('/add-views-column', (req, res) => {
    const sql = `
      ALTER TABLE blogs
      ADD COLUMN views INT DEFAULT 0
    `;

    // Execute the SQL statement to add the 'views' column
    connection.query(sql, (err, result) => {
        if (err) {
            console.error('Error adding views column to blogs table:', err);
            res.status(500).send('Error adding views column');
            return;
        }
        console.log('Views column added to blogs table');
        res.status(200).send('Views column added successfully');
    });
});


// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
