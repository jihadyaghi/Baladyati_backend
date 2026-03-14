const db = require('../config/db');
function generateRequestCode(id){
    const year = new Date().getFullYear();
    return `REQ-${year}-${String(id).padStart(6,'0')}`;
}
///api/requests
exports.getMyRequests = async(req,res)=>{
    try{
        const citizenId = req.citizenId;
        const [rows] = await db.execute(
        `SELECT
        r.request_id,
        r.request_code,
        r.status,
        r.created_at,
        r.updated_at,
        r.title,
        dt.document_name AS document_type,
        dr.purpose,
        su.full_name AS assigned_to_name
        FROM requests r
        JOIN document_requests dr
        ON r.request_id = dr.request_id
        JOIN document_types dt
        ON dr.document_type_id = dt.document_type_id
        LEFT JOIN staff_users su
        ON r.assigned_to = su.staff_id
        WHERE r.citizen_id = ?
        AND r.type = 'DOCUMENT'
        ORDER BY r.created_at DESC`,
        [citizenId]
        );
        return res.status(200).json({
            success: true,
            requests: rows
        });
    }
    catch (err){
        console.error('[requestController.getMyRequests]',err);
        return res.status(500).json({
            success: false,
            message:'Could not load requests.'
        })
    }
};
// /api/requests/:id
exports.getRequestsById = async (req,res)=>{
    try{
        const {id} = req.params;
        const citizenId = req.citizenId;
        const [rows] = await db.execute(
        `SELECT
        r.request_id,
        r.request_code,
        r.status,
        r.created_at,
        r.updated_at,
        r.title,
        r.description,
        dt.document_name AS document_type,
        dr.purpose,
        dr.delivery_method,
        dr.fee_amount,
        dr.payment_status,
        su.full_name AS assigned_to_name
        FROM requests r
        JOIN document_requests dr
        ON r.request_id = dr.request_id
        JOIN document_types dt
        ON dr.document_type_id = dt.document_type_id
        LEFT JOIN staff_users su
        ON r.assigned_to = su.staff_id
        WHERE r.request_id = ?
        AND r.citizen_id = ?
        AND r.type = 'DOCUMENT'
        LIMIT 1`,
        [id,citizenId]
        );
        if(rows.length === 0){
            return res.status(404).json({
                success:false,
                message: 'Request not found'
            });
        }
        const [notes] = await db.execute(
        `SELECT
        n.note_id,
        n.note_text,
        n.created_at,
        su.full_name AS staff_name
        FROM request_notes n
        LEFT JOIN staff_users su
        ON n.staff_id = su.staff_id
        WHERE n.request_id = ?
        ORDER BY n.created_at ASC`,
        [id]
        );
        return res.status(200).json({
            success: true,
            request: rows[0],
            notes,
        })
    }
    catch (err){
        console.error('[requestController.getRequestById]',err);
        return res.status(500).json({
            success: false,
            message: 'could not load request'
        })
    }
}
// /api/requests
// create new document request
exports.createRequest = async (req,res) =>{
    let connection;
    try{
        const citizenId = req.citizenId;
        const {documentTypeId, purpose} = req.body;
        if(!documentTypeId){
            return res.status(400).json({
                success: false,
                message: 'Document type is required.'
            });
        }
        const [docTypeRows] = await db.execute(
        `SELECT document_type_id, document_name, fee
        FROM document_types
        WHERE document_type_id = ?
        AND is_active = 1
        LIMIT 1`,
        [documentTypeId]
        );
        if(docTypeRows.length === 0){
            return res.status(400).json({
                success: false,
                message: 'Invalid document type.'
            });
        }
        const docType = docTypeRows[0];
        const [existingRows] = await db.execute(
        `SELECT r.request_id
        FROM requests r
        JOIN document_requests dr
        ON r.request_id = dr.request_id
        WHERE r.citizen_id = ?
        AND r.type = 'DOCUMENT'
        AND dr.document_type_id = ?
        AND r.status IN ('PENDING', 'IN_REVIEW', 'IN_PROGRESS')
        LIMIT 1`,
        [citizenId,documentTypeId]
        );
        if(existingRows.length > 0){
            return res.status(409).json({
                success: false,
                message: 'You already have an active request for this document type.'
            });
        }
        connection = await db.getConnection();
        await connection.beginTransaction();
        const [requestResult] = await connection.execute(
            `INSERT INTO requests (request_code, citizen_id, type, status, title, description) VALUES (?, ?, 'DOCUMENT', 'PENDING', ?, ?)`,
            [
                'TEMP-CODE',
                citizenId,
                docType.document_name,
                purpose ? purpose.trim() : null
            ]
        );
        const requestId = requestResult.insertId;
        const requestCode = generateRequestCode(requestId);
        await connection.execute(
            `UPDATE requests SET request_code = ? WHERE request_id = ?`,[requestCode,requestId]
        );
        await connection.execute(
            `INSERT INTO document_requests (request_id, document_type_id, purpose, delivery_method, fee_amount, payment_status) VALUES (?, ?, ?, 'PICKUP', ?, 'UNPAID')`,
            [
                requestId,
                documentTypeId,
                purpose ? purpose.trim() : null,
                docType.fee ?? 0
            ]
        );
        //create notfication
        await connection.execute(
            'INSERT INTO notifications (citizen_id, title, message) VALUES (?, ?, ?)',
            [
                citizenId,
                'Request Submitted',
                `Your request for "${docType.document_name}" has been submitted successfully.`
            ]
        );
        await connection.commit();
        connection.release();
        //Return created request
        const [[newRequest]] = await db.execute(
        `SELECT
        r.request_id,
        r.request_code,
        r.status,
        r.created_at,
        dt.document_name AS document_type,
        dr.purpose
        FROM requests r
        JOIN document_requests dr
        ON r.request_id = dr.request_id
        JOIN document_types dt
        ON dr.document_type_id = dt.document_type_id
        WHERE r.request_id = ?`,
        [requestId]
        );
        return res.status(201).json({
            success: true,
            message: 'Request submitted successfully.',
            request: newRequest
        });
    }
    catch (err){
        if(connection){
            await connection.rollback();
            connection.release();
        }
        console.error('[requestController.createRequest]',err);
        return res.status(500).json({
            success: false,
            message: 'Could not submit request.'
        })
    }
};
// Delete /api/request/:id
// Citizen can cancel only pending / in_review request
exports.cancelRequest = async(req,res) =>{
    try{
        const {id} = req.params;
        const citizenId = req.citizenId;
        const [rows] = await db.execute(
        `SELECT request_id, status FROM requests WHERE request_id = ? AND citizen_id = ? AND type = 'DOCUMENT' LIMIT 1`,
        [id,citizenId]
        );
        if(rows.length === 0){
            return res.status(404).json({
                success: false,
                message: 'Request not found'
            });
        }
        if(!['PENDING', 'IN_REVIEW'].includes(rows[0].status)){
            return res.status(400).json({
                success: false,
                message: 'Only pending in review requests can be cancelled.'
            })
        }
        await db.execute(
        `UPDATE requests SET status = 'CANCELLED' WHERE request_id = ?`,
        [id]
        );
        await db.execute(
        `INSERT INTO notifications (citizen_id, title, message) VALUES (?, ?, ?)`,
        [
            citizenId,
            'Request cancelled',
            'Your document request has been cancelled.'
        ]
        );
        return res.status(200).json({
            success: true,
            message: 'Request cancelled successfully.'
        });
    }
    catch (err){
        console.error('[requestController.cancelRequest]', err);
        return res.status(500).json({
            success: false,
            message: 'Could not cancel request.'
        })
    }
};
// /api/requests.document-types
// Return all active document types from database
exports.getDocumentTypes = async (req,res) => {
    try{
        const [rows] = await db.execute(
        `SELECT document_type_id, document_name FROM document_types WHERE is_active = 1 ORDER BY document_name ASC`
        );
        return res.status(200).json({
            success: true,
            documentTypes: rows
        });
    }
    catch (err){
        console.error('[requestController.getDocumentTypes]',err);
        return res.status(500).json({
            success: false,
            message: 'Could not load document types.'
        })
    }
}