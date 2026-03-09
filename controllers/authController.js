const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
function isValidDate(date) {
  const d = new Date(date);
  return !isNaN(d.getTime());
}

function toMysqlDate(date) {
  return new Date(date).toISOString().split('T')[0];
}
function normalizePhone(raw){  //hydi aamlneha krml twhid chakel ra2em l tlphon bl database (96181670212)
    let phone = String(raw).replace(/[\s\-\(\)]/g, '');//lw eja l ra2em ka number bnhwlu ka text, .replace(hydi krml bymhi l space and . and any pin)
    if (phone.startsWith('+')){//eiza hatet + btsir btnchel 
        phone = phone.slice(1);
    }
    if(phone.startsWith('00')){//eiza hat 00 awl chi kmn btnchel example(0096181670212) btsir (96181670212)
        phone = phone.slice(2);
    }
    if(phone.startsWith('0') && !phone.startsWith('096')){//eiza hat hada 0 awl chi example (081670212) btethwal l hk (96181670212)
        phone = '961' + phone.slice(1);
    }
    if(!phone.startsWith('961') && phone.length <=8){//eiza mch hatin 961 yaani hk (81670212) bsir hk (96181670212)
        phone = '961' + phone;
    }
    return phone;
}
function generateToken(citizenId){// hydi krml bs yaamol login btaati token enu hwe user msda2(Authenticated)
    return jwt.sign(
        {id: citizenId, role:'citizen'},
        process.env.JWT_SECRET,
        {expiresIn:process.env.JWT_EXPIRES_IN}
    );
}
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone and password are required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const normalizedPhone = normalizePhone(phone);

    const [rows] = await db.execute(
      `SELECT id, first_name, last_name, phone, password_hash, zone_id, created_at
       FROM citizens
       WHERE phone = ?
       LIMIT 1`,
      [normalizedPhone]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    const citizen = rows[0];

    const match = await bcrypt.compare(password, citizen.password_hash);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: 'Invalid phone or password'
      });
    }

    let zoneName = null;

    if (citizen.zone_id) {
      const [zoneRows] = await db.execute(
        `SELECT zone_name FROM zones WHERE zone_id = ? LIMIT 1`,
        [citizen.zone_id]
      );

      if (zoneRows.length > 0) {
        zoneName = zoneRows[0].zone_name;
      }
    }

    const token = generateToken(citizen.id);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      citizen: {
        id: citizen.id,
        firstName: citizen.first_name,
        lastName: citizen.last_name,
        phone: citizen.phone,
        zone: zoneName,
        memberSince: citizen.created_at
      }
    });

  } catch (err) {
    console.log('Login error:', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
exports.getMe = async (req,res) =>{ //api/auth/citizen/me
    //hydi krml bs l citizen yaamol login l awl mara bsir bs yfut teni mara dghri bykhdu aal home page m byaamol yrja3 login
    try{
        const citizenId = req.citizenId;
        const [rows] = await db.execute(
            `SELECT c.id,c.first_name,c.last_name,c.phone,c.date_of_birth,c.created_at,z.zone_name FROM citizens c LEFT JOIN zones z ON c.zone_id=z.zone_id WHERE c.id=? LIMIT 1`,[citizenId]
        );
        if (rows.length === 0){
            return res.status(404).json({
                success:false,
                message:'Citizen not found'
            });
        }
        const citizen = rows[0];
        return res.status(200).json({
            success:true,
            citizen:{
                id:citizen.id,
                firstname:citizen.first_name,
                lastName:citizen.last_name,
                phone:citizen.phone,
                dataOfBirth:citizen.date_of_birth,
                zone:citizen.zone_name,
                memberSince:citizen.created_at
            }
        });
    }
    catch (err){
        console.error('GetMe Error:',err);
        return res.status(500).json({
            success:false,
            message:'Internal server error'
        });
    }
};
exports.logout = async(req,res)=>{ ///api/auth/citizen/logout
    try {
        return res.status(200).json({
            success:true,
            message:'Logged out successfully'
        });
    }
    catch (err){
        console.error('Logout Error:', err);
        return res.status(500).json({
            success:false,
            message:'Internal server error'
        });
    }
};
exports.register = async (req,res)=>{
    try{
        const {
            firstName,
            lastName,
            phone,
            dateOfBirth,
            zoneId,
            password,
            confirmPassword,
        } = req.body;
        const missing = [];
    if(!firstName){
            missing.push('firstName');
        }
    if(!lastName){
            missing.push('lastName');
        }
    if(!phone){
            missing.push('phone');
        }
    if(!dateOfBirth){
            missing.push('dateofBirth');
        }
    if(!zoneId){
            missing.push('zoneId');
        }
    if(!password){
            missing.push('password');
        }
    if(!confirmPassword){
            missing.push('confirm password');
        }
    if(missing.length > 0){
            return res.status(400).json({
                success:false,
                message: `Missing required fields: ${missing.join(', ')}`
            })
        }
        const firstNameTrimmed = String(firstName).trim();
        const lastNameTrimmed = String(lastName).trim();
    if (firstNameTrimmed.length <2 || firstNameTrimmed.length>50){
            return res.status(400).json({
                success: false,
                message: `First name must be between 2 and 50 characters.`
            })
        }
    if(lastNameTrimmed.length<2 || lastNameTrimmed.length>50){
            return res.status(400).json({
                success:false,
                message: `Last name must be between 2 and 50 characters.`
            })
        }
        const normalizedPhone = normalizePhone(phone);
    if(normalizedPhone.length <10){
            return res.status(400).json({
                success:false,
                message: `Enter a valid Lebanese phone number.`
            })
        }
    if(!isValidDate(dateOfBirth)){
            return res.status(400).json({
                success:false,
                message: `Invalid date of birth.`
            })
        }
        const dob = new Date(dateOfBirth);
        const today = new Date();
        const ageDiff = today.getFullYear() - dob.getFullYear();
        const hadBirthday = today.getMonth() > dob.getMonth() || (today.getMonth() === dob.getMonth() && today.getDate() >= dob.getDate());
        const age = hadBirthday ? ageDiff : ageDiff - 1;
    if (age < 16) {
      return res.status(400).json({
        success: false,
        message: 'You must be at least 16 years old to register.',
      });
    }
    if (typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.',
      });
    }
    const [zoneRows] = await db.execute(
      `SELECT zone_id, zone_name FROM zones WHERE zone_id = ? LIMIT 1`,
      [parseInt(zoneId)]
    );
    if (zoneRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid residential zone selected.',
      });
    }
    const zone = zoneRows[0];
    const [existingRows] = await db.execute(
      `SELECT id FROM citizens WHERE phone = ? LIMIT 1`,
      [normalizedPhone]
    );
    if (existingRows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This phone number is already registered. Try logging in.',
      });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await db.execute(
      `INSERT INTO citizens
         (first_name, last_name, phone, password_hash, date_of_birth, zone_id, is_verified)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [
        firstNameTrimmed,
        lastNameTrimmed,
        normalizedPhone,
        passwordHash,
        toMysqlDate(dateOfBirth),
        parseInt(zoneId),
      ]
    );
    const newCitizenId = result.insertId;
    const token = generateToken(newCitizenId);
    return res.status(201).json({
      success: true,
      message: 'Account created successfully. Welcome to Baladiyati!',
      token,
      citizen: {
        id:          newCitizenId,
        firstName:   firstNameTrimmed,
        lastName:    lastNameTrimmed,
        phone:       normalizedPhone,
        zone:        zone.zone_name,
        isVerified:  true,
        memberSince: new Date().toISOString(),
      },
    });
    }
    catch (err){
    console.error('[registerController.register]', err);
    return res.status(500).json({
      success: false,
      message: 'Internal server error. Please try again.',
    });
    }
};
exports.getZones = async (req, res) => {
  try {
    const [rows] = await db.execute(
  `SELECT zone_id, zone_name 
   FROM zones 
   WHERE is_active = 1
   ORDER BY zone_name`
);
    return res.status(200).json({ success: true, zones: rows });
  } catch (err) {
    console.error('[registerController.getZones]', err);
    return res.status(500).json({
      success: false,
      message: 'Could not load zones.',
    });
  }
};
