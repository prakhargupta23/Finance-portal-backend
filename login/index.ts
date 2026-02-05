import { AzureFunction, Context, HttpRequest } from "@azure/functions";
const jwt = require("jsonwebtoken");
import * as dotenv from 'dotenv';
dotenv.config();


function generateJwtToken(username: string) {
  return jwt.sign({ sub: username, id: username }, process.env["secret"]);
}

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  try {
    
    const { username, password, portal } = req.body;

    // Store all credentials in an array
    const users = [
      {
        username: process.env.USERDETAIL,
        password: process.env.PASSWORD,
        portal: process.env.PORTAL,
        role: "mainAdmin",
      },
      {
        username: process.env.USERDETAILS1,
        password: process.env.PASSWORD1,
        portal: process.env.PORTAL,
        role: "Jaipur",
      },
      {
        username: process.env.USERDETAILS2,
        password: process.env.PASSWORD2,
        portal: process.env.PORTAL,
        role: "Bikaner",
      },
      {
        username: process.env.USERDETAILS3,
        password: process.env.PASSWORD3,
        portal: process.env.PORTAL,
        role: "Jodhpur",
      },
      {
        username: process.env.USERDETAILS4,
        password: process.env.PASSWORD4,
        portal: process.env.PORTAL,
        role: "Ajmer",
      },
      {
        username: process.env.USERDETAILS5,
        password: process.env.PASSWORD5,
        portal: process.env.PORTAL1,
        role: "mainAdmin",
      },
      {
        username: process.env.USERDETAILS6,
        password: process.env.PASSWORD6,
        portal: process.env.PORTAL1,
        role: "division",
      },
      {
        username: 'expenditure-admin',
        password: 'Acghu0152',
        portal: 'expenditure',
        role: "mainAdmin",
      },
      {
        username: 'workshop-admin',
        password: 'Akj456',
        portal: 'PFA',
        role: "workshop",
      },
    ];

    console.log(users);

    const matchedUser = users.find(
      (user) => user.username === username && user.password === password && user.portal === portal
    );
    console.log("Matched User:", matchedUser);
    
    
    console.log("Matched User:2", matchedUser);

    if (matchedUser) {
      const jwtToken = generateJwtToken(username);
      context.res = {
        status: 200,
        body: {
          success: true,
          message: "Login successful",
          data: {
            username,
            jwt: jwtToken,
            role: matchedUser.role,
          },
        },
      };
    } else {
      context.res = {
        status: 200,
        body: {
          success: false,
          message: "Invalid username or password",
          data: null,
        },
      };
    }
  } catch (error) {
    context.res = {
      status: 500,
      body: { success: false, message: `Error: ${error.message}` },
    };
  }
};

export default httpTrigger;
