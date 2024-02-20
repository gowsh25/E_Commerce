const express = require("express");
const mysql = require("mysql");

const fs = require("fs");
const path = require("path");

const app = express();
const port = 3000;
const { Client } = require("@elastic/elasticsearch");
const ELASTIC_HOST = process.env.ELASTIC_HOST || "localhost";

const esClient = new Client({
  node: `http://${ELASTIC_HOST}:9200`,
  requestTimeout: 30000,
});
// node: "http://192.168.1.104:9200", // Replace with your Elasticsearch server URL);

// MySQL database connection configuration
const connection = mysql.createConnection({
  host: "192.168.1.104",
  user: "root",
  password: "veera@123",
  database: "e_commerce",
});

// Connect to MySQL database
connection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database: " + err.stack);
    return;
  }
  console.log("Connected to MySQL database as id " + connection.threadId);
});

// Route to fetch data from MySQL database and render HTML page with table

app.get("/category/json", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const totalCountQuery = "SELECT COUNT(*) AS total FROM category";
  connection.query(totalCountQuery, (error, totalCountResult) => {
    if (error) {
      console.error("Error getting total row count:", error);
      return res.status(500).send("Internal server error");
    }

    const totalRows = totalCountResult[0].total;
    const totalPages = Math.ceil(totalRows / limit);

    const query = `SELECT * FROM category LIMIT ${limit} OFFSET ${offset}`;
    connection.query(query, (error, results) => {
      if (error) {
        console.error("Error executing MySQL query:", error);
        return res.status(500).send("Internal server error");
      }

      // Instead of generating HTML, send the results as JSON
      res.json({
        categories: results,
        totalPages: totalPages,
        currentPage: page,
      });
    });
  });
});



app.get("/products/json", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  // First, count the total number of products
  const countQuery = "SELECT COUNT(*) AS count FROM products";
  connection.query(countQuery, (countError, countResult) => {
    if (countError) {
      console.error("Error counting products:", countError);
      return res.status(500).send("Internal server error");
    }

    const totalProducts = countResult[0].count;
    const totalPages = Math.ceil(totalProducts / limit);

    // Then, fetch the products for the current page
    const query = "SELECT * FROM products LIMIT ? OFFSET ?";
    connection.query(query, [limit, offset], (error, results) => {
      if (error) {
        console.error("Error fetching products:", error);
        return res.status(500).send("Internal server error");
      }

      // Send the product data as JSON
      res.json({
        products: results,
        currentPage: page,
        totalPages: totalPages,
        totalProducts: totalProducts,
      });
    });
  });
});

app.get("/products", (req, res) => {
  res.sendFile(__dirname + "/Front_end/products.html"); // Adjust the path to your actual HTML file
});

app.get("/searchjson", async (req, res) => {
  let rowsPerPage = 10;
  const page = parseInt(req.query.page) || 1;
  var query = req.query.query;
  console.log(query);

  var down = ["under", "below", "less", "within", "down", "lesser", "in", "@"];
  //var eq = ["=", "@"];
  var up = ["over", "above", "greater", "up"];
  var extra = [
    ",",
    ".",
    "/",
    ":",
    "[",
    "]",
    "rs",
    "Rs",
    "amt",
    "Amt",
    "+",
    "-",
    '"',
    "'", // Single quote
    "`", // Backtick
    "than",
    '\\"', // Escaped double quotes to explicitly include them in the list
  ];
  // console.log("quer "+query);

  var string = query.split(" ");
  var cur, sort;

  extra.forEach((val) => {
    if (query.includes(val)) {
      query = query.replace(val, "");
    }
  });

  string.forEach((val) => {
    if (down.includes(val)) {
      cur = val;
      sort = "lte";
      return;
    } else if (up.includes(val)) {
      cur = val;
      sort = "gte";
      return;
    }
  });

  if (cur) {
    var [data, price] = query.split(cur);
    var value = parseFloat(price);
  } else {
    var data = query;
    var value = 10000000;
    sort = "lte";
  }
  //console.log(data,value)
  try {
    const response = await esClient.search({
      index: "product_index",
      // Adjusted Elasticsearch query setup
      body: {
        from: (page - 1) * rowsPerPage,
        size: rowsPerPage,
        query:
          query === "*"
            ? { match_all: {} }
            : {
                // Adjust based on your actual needs
                bool: {
                  must: [
                    {
                      exists: { field: "discount_price" },
                    },
                  ],
                  filter: [
                    {
                      range: { discount_price: { [sort]: value } },
                    },
                  ],
                  should: [
                    {
                      multi_match: {
                        query: data,
                        fields: ["product_name^3", "brand^3", "categoryName"],
                        fuzziness: "AUTO",
                      },
                    },
                  ],
                  minimum_should_match: 1,
                },
              },
        _source: [
          "product_id",
          "product_name",
          "brand",
          "categoryName",
          "MRP",
          "discount_price",
          "date_added",
          "category_id",
        ],
      },
    });

    // console.log(response.hits.hits);

    if (response.hits && response.hits.hits) {
      const results = response.hits.hits.map((hit) => hit._source);
      //console.log(results);
      // Insert the search results into the HTML content
      const totalResults = response.hits.total.value;
      const totalPages = Math.ceil(totalResults / rowsPerPage);
      res.json({
        products: results,
        currentPage: page,
        totalPages: totalPages,
        totalProducts: totalResults,
      });
    } else {
      res.json({
        products: [],
        message: "No results found.",
        currentPage: page,
        totalPages: 0,
        totalProducts: 0,
      });
    }
  } catch (error) {
    console.error("Search query failed:", error);
    res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
});

app.get("/search", (req, res) => {
  res.sendFile(__dirname + "/Front_end/search.html"); // Adjust the path to your actual HTML file
});

app.get("/details/:categoryId/json", (req, res) => {
  const categoryId = parseInt(req.params.categoryId);
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  let totalCountQuery =
    "SELECT COUNT(*) AS total FROM products  WHERE category_id = ?";
  let query = "SELECT * FROM products  WHERE category_id = ? LIMIT ? OFFSET ?";
  let queryParams = [categoryId, limit, offset];

  let query1 = "SELECT * FROM category";

  // First, get the total count for pagination
  connection.query(totalCountQuery, [categoryId], (error, totalResult) => {
    if (error) {
      console.error("Error getting total count:", error);
      return res.status(500).send("Internal server error");
    }

    const totalCount = totalResult[0].total;
    const totalPages = Math.ceil(totalCount / limit);

    // Then, fetch the products
    connection.query(query, queryParams, (error, products) => {
      if (error) {
        console.error("Error fetching products:", error);
        return res.status(500).send("Internal server error");
      }

      connection.query(query1, (error, dropdown) => {
        if (error) {
          console.error("Error fetching products:", error);
          return res.status(500).send("Internal server error");
        }
        res.json({
          products,
          dropdown,
          currentPage: page,
          totalPages,
          totalCount,
        });
      });
    });
  });
});

app.get("/details/:categoryId", (req, res) => {
  res.sendFile(__dirname + "/Front_end/details.html"); // Adjust the path to your actual HTML file
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
