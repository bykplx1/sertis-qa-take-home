const express = require('express');
const app = express();
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const fs = require("fs")
const YAML = require('yaml')

app.use(cors({optionsSuccessStatus: 200}));

// const path = require("path");

const bodyParser = require('body-parser');
app.use(bodyParser.json());


const user_data = {
  "001": {
    "first_name": "John",
    "last_name": "Doe",
    "permission": "admin",
    "phone_no": "020011893",
    "otp": "123456"
  },
  "002": {
    "first_name": "Jane",
    "last_name": "Smith",
    "permission": "user",
    "phone_no": "020011894",
    "otp": "654321"
  }
}

// ----------------

app.get("/user/ids", (_, res) => {
  console.log("i am her!!")
  res.send(Object.keys(user_data)) 
  
});

app.get("/user/:id", (req, res) => {
  const id = req.params.id
  if (id in user_data ) {
    const data = user_data[id];
    res.send(data);
  } else {
    res.status(400)
    res.send({"status_code": "400", "message": `${id} is not a valid id`}) 
  }
  
});

// API clients registration
app.post("/signin", function(req, res) {  
  
  const body = req.body;
  
  let status_code, out;
  if ("phone_no" in body || "otp" in body) {
    
    for (const [id, data] of Object.entries(user_data)) {
      
      if ((body.phone_no == data.phone_no) && (body.otp == data.otp)) {
        status_code = 200
        out = {
          status_code,
          "status": "Pass",
          "data": {
            "id": id,
            "first_name": data.first_name,
            "last_name": data.last_name,
            "permission": data.permission
          },
          "message": "Sign in success"
        }
      }
      
      if (out) {
        break
      }
    }
    
    if (!out) {
      status_code = 404
      out = {
        status_code,
        "status": "Not found",
        "data": {},
        "message": "User not found"
      }
    }
  } else {
    status_code = 500
    out = {
      status_code,
      "status": "Fail",
      "data": {},
      "message": "Internal Server Error"
    }
  }
  
  res.status(status_code)
  res.send(out)  
  
})


const file  = fs.readFileSync('./swagger.yaml', 'utf8')
const swaggerDocument = YAML.parse(file)
app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument));


const appPort = process.env.PORT || 3000
app.listen(appPort, () => console.log(`Listening to port ${appPort}`));