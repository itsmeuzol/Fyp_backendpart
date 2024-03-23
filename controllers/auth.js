const mysql = require("mysql");
const jwt = require("jsonwebtoken");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");

const db = require("../config/dbConnection");

const randomstring = require("randomstring");

const sendMail = require("../helpers/sendMail");

const { JWT_SECRET } = process.env;

// const db = mysql.createConnection({
//   host: process.env.DATABASE_HOST,
//   user: process.env.DATABASE_USER,
//   password: process.env.DATABASE_PASSWORD,
//   database: process.env.DATABASE,
// });

const register = (req, res) => {
  db.query(
    `SELECT * FROM users WHERE LOWER(email) = LOWER(${db.escape(
      req.body.email
    )})`,
    (err, result) => {
      if (result && result.length) {
        return res.status(400).json({
          success: false,
          message: "User already exists",
        });
      } else {
        bcrypt.hash(req.body.password, 8, (err, hash) => {
          if (err) {
            return res.status(400).json({
              success: false,
              message: err,
            });
          } else {
            const role = "user";
            db.query(
              `INSERT INTO users (name, email, password, role, phone, isAdmin, isStaff) VALUES ('${
                req.body.name
              }',${db.escape(req.body.email)}, ${db.escape(
                hash
              )}, '${role}', 0, false, false)`,
              (err, result) => {
                if (err) {
                  return res.status(400).json({
                    success: false,
                    message: err,
                  });
                }

                let mailSubject = "Mail Verification";
                const randomToken = randomstring.generate();
                let content =
                  "<p>Hi" +
                  req.body.name +
                  ', Please <a href="http://localhost:5000/mail-verification?token=' +
                  randomToken +
                  '"> Verify</a> your Mail</p';

                sendMail(req.body.email, mailSubject, content);

                db.query(
                  "UPDATE users SET token=? WHERE email=?",
                  [randomToken, req.body.email],
                  function (error, result, fields) {
                    if (error) {
                      res.status(400).json({
                        success: false,
                        message: err,
                      });
                    }
                  }
                );

                return res.status(200).json({
                  success: true,
                  message: "User has been registered",
                  token: randomToken,
                });
              }
            );
          }
        });
      }
    }
  );
};

const verifyMail = (req, res) => {
  const token = req.query.token;

  db.query(
    "SELECT * FROM users WHERE token=? limit 1",
    token,
    function (error, result, fields) {
      if (error) {
        console.log(error.message);
      }
      if (result.length > 0) {
        db.query(
          `UPDATE users SET token = null, is_Verified = true WHERE id = '${result[0].id}'`
        );

        return res.render("mail-verification", {
          message: "Mail Verified Successfully!",
        });
      } else {
        return res.json({
          success: false,
          message: "Failed",
        });
      }
    }
  );
};

const login = (req, res) => {
  // const errors = validationResult(req);

  // if (!errors.isEmpty()) {
  //   return res.status(400).json({
  //     success: false,
  //     message: "Enter all the fields",
  //   });
  // }

  db.query(
    `SELECT * FROM users WHERE email = ${db.escape(req.body.email)}`,
    (err, result) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err,
        });
      }
      if (!result.length) {
        return res.status(401).json({
          success: false,
          message: "Invalid Credentials",
        });
      }

      bcrypt.compare(
        req.body.password,
        result[0]["password"],
        (bErr, bResult) => {
          if (bErr) {
            return res.status(400).json({
              success: false,
              message: bErr,
            });
          }
          if (bResult) {
            const token = jwt.sign({ id: result[0]["id"] }, JWT_SECRET, {
              expiresIn: "1h",
            });
            // db.query(`UPDATE users SET last_login = now() WHERE id='${result[0]["id"]}'`)
            return res.status(200).json({
              success: true,
              data: result[0],
              token,
              message: "Logged In",
            });
          }
          return res.status(401).json({
            success: false,
            message: "Invalid Credentials",
          });
        }
      );
    }
  );
};

const getUser = (req, res) => {
  const authToken = req.headers;
  db.query(
    "SELECT * FROM users WHERE is_Verified = true",
    // [decode.id],
    function (error, result, fields) {
      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: result,
      });
    }
  );
};

const forgetPassword = (req, res) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Enter all the fields",
    });
  }

  const email = req.body.email;
  db.query(
    "SELECT * FROM users WHERE email=? limit 1",
    email,
    function (error, result, fields) {
      if (error) {
        return res.status(400).json({
          message: error,
        });
      }

      if (result.length > 0) {
        let mailSubject = "Forget Password";

        const randomString = randomstring.generate();
        let content =
          "<p>Hi," +
          result[0].name +
          ' \
          Please <a href="http://localhost:5000/reset-password?token=' +
          randomString +
          '">Click Here</a> to reset your password</p>\
        ';

        sendMail(email, mailSubject, content);

        db.query(
          `DELETE FROM password_resets WHERE email=${db.escape(
            result[0].email
          )}`
        );

        db.query(
          `INSERT INTO password_resets (email, token) VALUES (${db.escape(
            result[0].email
          )}, '${randomString}')`
        );

        return res.status(200).json({
          message: "Mail Sent Successfully",
        });
      }
      return res.status(401).json({
        message: "Email doesn't exists!",
      });
    }
  );
};

const resetPasswordLoad = (req, res) => {
  try {
    const token = req.query.token;
    if (token === undefined) {
      res.render("404");
    }
    db.query(
      `SELECT * FROM password_resets WHERE token=? limit 1`,
      token,
      function (error, result, fields) {
        if (error) {
          console.log(error);
        }

        if (result !== undefined && result.length > 0) {
          db.query(
            "SELECT * FROM users WHERE email=? limit 1",
            result[0].email,
            function (error, result, fields) {
              if (error) {
                console.log(error);
              }

              res.render("reset-password", {
                user: result[0],
              });
            }
          );
        } else {
          res.render("404");
        }
      }
    );
  } catch (error) {
    console.log(error.message);
  }
};

const resetPassword = (req, res) => {
  if (req.body.password !== req.body.confirm_password) {
    res.render("reset-password", {
      error_message: "Password Not Matched",
      user: { id: req.body.user_id, email: req.body.email },
    });
  }

  bcrypt.hash(req.body.confirm_password, 8, (err, hash) => {
    if (err) {
      console.log(err);
    }

    db.query(`DELETE FROM password_resets WHERE email = '${req.body.email}'`);

    db.query(
      `UPDATE users SET password = '${hash}' WHERE id = '${req.body.user_id}'`
    );

    res.render("message", {
      message: "Password Reset Successfully!",
    });
  });
};

const associateLogin = (req, res) => {
  db.query(
    `SELECT * FROM associate WHERE email = ${db.escape(req.body.email)}`,
    (err, result) => {
      console.log("aefjafnjkaef");
      if (err) {
        return res.status(400).json({
          success: false,
          message: "Cannot find associates",
        });
      }
      if (!result.length) {
        console.log("irjgiojrgojsgr");
        return res.status(401).json({
          success: false,
          message: "Invalid Credentials",
        });
      }
      console.log("aefafamkmkifvmskvfd", result);

      bcrypt.compare(
        req.body.password,
        result[0]["password"],
        (bErr, bResult) => {
          console.log("yeta");
          if (bErr) {
            console.log("error");
            return res.status(400).json({
              success: false,
              message: bErr,
            });
          }
          console.log("yeta hai aaba");
          if (bResult) {
            console.log("success");
            const token = jwt.sign({ id: result[0]["id"] }, JWT_SECRET, {
              expiresIn: "1h",
            });
            console.log(token);
            return res.status(200).json({
              success: true,
              data: result[0],
              token,
              message: "Associate logged in",
            });
          } else {
            return res.status(401).json({
              success: false,
              message: "Invalid Credentials",
            });
          }
        }
      );
    }
  );
};

const addStaff = (req, res) => {
  try {
    const { name, email, password, location, wardno, houseno, phone } =
      req.body;
    const newUser = {
      name,
      email,
      password,
      location,
      wardno,
      houseno,
      phone,
      isAdmin: false,
      isStaff: true,
    };

    addUser(newUser)
      .then((insertedUserId) => {
        res
          .status(201)
          .json({ message: "Staff member added successfully.", user: newUser });
      })
      .catch((error) => {
        console.log(error);
        res.status(500).json({ error: "Internal Server Error" });
      });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const addUser = (user) => {
  return new Promise((resolve, reject) => {
    bcrypt.hash(user.password, 8, (err, hash) => {
      if (err) {
        reject(err);
      } else {
        const associateQuery = `
          INSERT INTO associate 
          (name, email, password, location, wardno, houseno, phone, isAdmin, isStaff) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const associateValues = [
          user.name,
          user.email,
          hash,
          user.location,
          user.wardno,
          user.houseno,
          user.phone,
          user.isAdmin,
          user.isStaff,
        ];

        db.query(associateQuery, associateValues, (error, associateResults) => {
          if (error) {
            reject(error);
          } else {
            const usersQuery = `
              INSERT INTO users 
              (name, email, password, role, location, houseno, wardno, phone, is_Verified) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const usersValues = [
              user.name,
              user.email,
              hash,
              "staff", // Assuming role for staff members
              user.location,
              user.houseno,
              user.wardno,
              user.phone,
              true, // Assuming newly added staff members are already verified
            ];

            db.query(usersQuery, usersValues, (userError, userResults) => {
              if (userError) {
                reject(userError);
              } else {
                resolve(associateResults.insertId); // Resolve with the ID from associate table
              }
            });
          }
        });
      }
    });
  });
};

const getStaff = (req, res) => {
  try {
    const query = "SELECT * FROM associate WHERE isStaff = true";

    db.query(query, (error, results) => {
      if (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to fetch staff" });
      }

      return res.status(200).json({ success: true, staffMembers: results });
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const editStaff = (req, res) => {
  try {
    const { id } = req.query;
    const { name, email, location, wardno, houseno, phone } = req.body;

    let updates = [];
    let queryParams = [];

    if (name) {
      updates.push("name=?");
      queryParams.push(name);
    }
    if (email) {
      updates.push("email=?");
      queryParams.push(email);
    }
    if (location) {
      updates.push("location=?");
      queryParams.push(location);
    }
    if (wardno) {
      updates.push("wardno=?");
      queryParams.push(wardno);
    }
    if (houseno) {
      updates.push("houseno=?");
      queryParams.push(houseno);
    }
    if (phone) {
      updates.push("phone=?");
      queryParams.push(phone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No fields provided for update" });
    }

    const query = `UPDATE associate SET ${updates.join(
      ", "
    )} WHERE id = ? AND isStaff = true AND isAdmin = false`;

    db.query(query, [...queryParams, id], (error, results) => {
      if (error) {
        console.log(error);
        return res.status(500).json({ error: "Failed to edit staff" });
      }

      if (results.affectedRows === 0) {
        return res
          .status(403)
          .json({ error: "You cannot edit the data of an admin" });
      }

      return res.status(200).json({
        success: true,
        message: "Staff member updated successfully",
      });
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const getStaffAccWard = (req, res) => {
  try {
    // Extract ward from the request body or request parameters
    const { wardno } = req.query; // Assuming ward is sent in the request body

    // Construct the SQL query with a WHERE clause to filter by the ward
    const query = "SELECT * FROM associate WHERE isStaff = true AND wardno = ?";

    // Execute the query with the ward as a parameter
    db.query(query, [wardno], (error, results) => {
      if (error) {
        console.log(error);
        return res
          .status(500)
          .json({ error: "Failed to fetch staff from this ward" });
      }

      return res.status(200).json({ success: true, staffMembers: results });
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

const addDustbin = (req, res) => {
  try {
    const { location, fill_percentage, wardno, assigned_staff, dustbin_type } =
      req.body;

    db.query(
      "INSERT INTO dustbin (location, wardno, fill_percentage, assigned_staff, dustbin_type) VALUES (?, ?, ?, ?, ?)",
      [location, wardno, fill_percentage, assigned_staff, dustbin_type],
      (err, result) => {
        if (err) {
          console.error("Failed to add a dustbin:", err);
          return res.status(400).json({
            success: false,
            message: "Failed to add a dustbin",
          });
        }
        return res.status(200).json({
          success: true,
          message: "Dustbin added successfully",
        });
      }
    );
  } catch (error) {
    console.error("Error adding dustbin:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getDustbin = (req, res) => {
  try {
    db.query(" SELECT * FROM dustbin", (err, result) => {
      if (err) {
        console.error("Error getting dustbins:", err);
        return res.status(400).json({
          success: false,
          message: "Failed to get dustbins",
        });
      }
      console.log("Dustbins retrieved successfully");
      return res.status(200).json({
        success: true,
        data: result,
      });
    });
  } catch (error) {
    console.error("Error getting dustbin:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getDustbinFilter = (req, res) => {
  try {
    const { assigned_staff, location, wardno } = req.query;

    let query = "SELECT * FROM dustbin WHERE 1";

    if (assigned_staff) {
      query += ` AND assigned_staff = ${assigned_staff}`;
    }
    if (location) {
      query += ` AND location = '${location}'`;
    }
    if (wardno) {
      query += ` AND wardno = ${wardno}`;
    }

    db.query(query, (err, results) => {
      if (err) {
        console.error("Error getting filtered dustbins:", err);
        return res.status(400).json({
          success: false,
          message: "Failed to get filtered dustbins",
        });
      }
      return res.status(200).json({
        success: true,
        data: results,
      });
    });
  } catch (error) {
    console.error("Error getting filter dustbin:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const editDustbin = (req, res) => {
  try {
    const { location, fill_percentage, wardno, assigned_staff, dustbin_type } =
      req.body;
    const id = req.query.id;

    db.query(
      "SELECT location, fill_percentage, wardno, assigned_staff, dustbin_type FROM dustbin WHERE id = ?",
      [id],
      (error, results, fields) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: "Error fetching existing data",
          });
        }

        if (results.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Dustbin not found",
          });
        }

        const existingData = results[0];

        const updatedFields = {};

        if (location !== undefined) updatedFields.location = location;
        if (wardno !== undefined) updatedFields.wardno = wardno;
        if (fill_percentage !== undefined)
          updatedFields.fill_percentage = fill_percentage;
        if (assigned_staff !== undefined)
          updatedFields.assigned_staff = assigned_staff;
        if (dustbin_type !== undefined)
          updatedFields.dustbin_type = dustbin_type;

        db.query(
          "UPDATE dustbin SET ? WHERE id = ?",
          [updatedFields, id],
          (error, results, fields) => {
            if (error) {
              return res.status(400).json({
                success: false,
                message: "Error editing dustbin",
              });
            }
            return res.status(200).json({
              success: true,
              message: "Dustbin edited successfully",
            });
          }
        );
      }
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const deleteDustbin = (req, res) => {
  try {
    const id = req.query.id;
    db.query(
      "DELETE FROM dustbin WHERE id = ?",
      [id],
      (error, results, fields) => {
        if (error) {
          return res.status(400).json({
            success: false,
            message: "Error deleting dustbin",
          });
        }
        return res.status(200).json({
          success: true,
          message: "Dustbin deleted successfully",
        });
      }
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const addPickupTime = (req, res) => {
  try {
    const { location, wardno, street, pickup_time, message } = req.body;

    db.query(
      "INSERT INTO schedule (location, wardno, street, pickup_time, message) VALUES (?, ?, ?, ?, ?)",
      [location, wardno, street, pickup_time, message],
      (error, results, fields) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: "Cannot add pickup time",
          });
        }
        return res.status(200).json({
          success: true,
          message: "Pickup time added successfully",
        });
      }
    );
  } catch (error) {
    console.error("Error adding pickup time:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getPickupTime = (req, res) => {
  try {
    db.query(" SELECT * FROM schedule", (err, result) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: "Failed to get pickup time",
        });
      }
      console.log("Pickup time retrieved successfully");
      return res.status(200).json({
        success: true,
        data: result,
      });
    });
  } catch (error) {
    console.error("Error getting pickup times:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getPickupTimeFilter = (req, res) => {
  try {
    const { location, wardno } = req.query;

    let query = "SELECT * FROM schedule WHERE 1";

    if (location) {
      query += ` AND location = '${location}'`;
    }
    if (wardno) {
      query += ` AND wardno = ${wardno}`;
    }

    db.query(query, (err, results) => {
      if (err) {
        console.error("Error getting filtered pickup times:", err);
        return res.status(400).json({
          success: false,
          message: "Failed to get filtered pickup times",
        });
      }
      console.log("Filtered pickup times retrieved successfully");
      return res.status(200).json({
        success: true,
        data: results,
      });
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const editTime = (req, res) => {
  try {
    const { location, wardno, street, pickup_time, message } = req.body;
    const id = req.query.id;

    db.query(
      "SELECT location, wardno, street, pickup_time, message FROM schedule WHERE id = ?",
      [id],
      (error, results, fields) => {
        if (error) {
          return res.status(500).json({
            success: false,
            message: "Error fetching existing data",
          });
        }

        if (results.length === 0) {
          return res.status(404).json({
            success: false,
            message: "Schedule not found",
          });
        }

        const existingData = results[0];

        const updatedFields = {};

        if (location !== undefined) updatedFields.location = location;
        if (wardno !== undefined) updatedFields.wardno = wardno;
        if (street !== undefined) updatedFields.street = street;
        if (pickup_time !== undefined) updatedFields.pickup_time = pickup_time;
        if (message !== undefined) updatedFields.message = message;

        db.query(
          "UPDATE schedule SET ? WHERE id = ?",
          [updatedFields, id],
          (error, results, fields) => {
            if (error) {
              return res.status(400).json({
                success: false,
                message: "Error editing pickup time",
              });
            }
            return res.status(200).json({
              success: true,
              message: "Pickup time edited successfully",
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Error editing pickup time:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const deleteTime = (req, res) => {
  try {
    const id = req.query.id;
    db.query(
      "DELETE FROM schedule WHERE id = ?",
      [id],
      (error, results, fields) => {
        if (error) {
          return res.status(400).json({
            success: false,
            message: "Error deleting pickup time",
          });
        }
        return res.status(200).json({
          success: true,
          message: "Pickup time deleted successfully",
        });
      }
    );
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// const getPickupTimeFilter = (req, res) => {
//   try {
//     let query = "SELECT * FROM schedule";
//     const queryParams = [];

//     if (req.query.location) {
//       const locations = Array.isArray(req.query.location)
//         ? req.query.location
//         : [req.query.location];

//       if (locations.length === 1) {
//         query += " WHERE location = ?";
//         queryParams.push(locations[0]);
//       } else {
//         const placeholders = locations.map(() => "?").join(",");
//         query += " WHERE location IN (" + placeholders + ")";
//         queryParams.push(...locations);
//       }
//     }

//     db.query(query, queryParams, (error, results, fields) => {
//       if (error) {
//         return res.status(500).json({
//           success: false,
//           message: "Error getting filtered pickup times",
//         });
//       }
//       return res.status(200).json({
//         success: true,
//         data: results,
//       });
//     });
//   } catch (error) {
//     return res.status(500).json({
//       success: false,
//       message: "Internal Server Error",
//     });
//   }
// };

// const getPickupTimeFilter = (req, res) => {
//   try {
//     const { location } = req.query;

//     let query = "SELECT * FROM schedule";

//     const queryParams = [];

//     if (location) {
//       query += " WHERE location = ?";
//       queryParams.push(location);
//     }

//     db.query(query, queryParams, (error, results, fields) => {
//       if (error) {
//         return res.status(500).json({
//           success: false,
//           message: "Error getting filtered pickup times",
//         });
//       }
//       return res.status(200).json({
//         success: true,
//         data: results,
//       });
//     });
//   } catch (error) {
//     console.error("Error getting filtered pickup times:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Internal Server Error",
//     });
//   }
// };

module.exports = {
  register,
  verifyMail,
  login,
  getUser,
  forgetPassword,
  resetPasswordLoad,
  resetPassword,
  associateLogin,
  addStaff,
  editStaff,
  getStaff,
  getStaffAccWard,
  addDustbin,
  getDustbin,
  getDustbinFilter,
  editDustbin,
  deleteDustbin,
  addPickupTime,
  getPickupTime,
  getPickupTimeFilter,
  editTime,
  deleteTime,
};
