import { getGpt4oResponse } from "./ai.service";
import pdfParse from 'pdf-parse';
import sequelize from "../config/sequelize";
import { expenditurebills } from '../Model/Expenditurebills.model'; // Assuming you've defined models properly
import { ReceiptNote } from "../Model/RecieptNote.model";
import { TaxInvoice } from "../Model/TaxInvoice.model";
import { GstInvoice } from "../Model/GstInvoice.model";
import { ModificationInvoice } from "../Model/ModificationAdvice.model";
import { PurchaseOrder } from "../Model/PurchaseOrder.model";
import { InspectionCertificate } from "../Model/InspectionCertificate.model";
import { ExpenditureBill } from "../Model/ExpenditureBill.model";
import { FinanceNote } from '../Model/FinanceNote.model';
import { RejectionNote } from '../Model/RejectionNote.model';

import * as mammoth from 'mammoth';
import { runPythonScript } from "./ocr"
import { saveTextToFile } from "./saveintxt"
import * as fs from 'fs';
import axios from 'axios';
import { ExpenditureReport } from "../Model/ExpenditureReport.model";

export interface ExpenditureRowDB {
  SNo: number;
  Status: string;
  // Committee: string;
  ReceiptNote: string | null;
  TaxInvoice: string | null;
  GSTInvoice: string | null;
  ModificationAdvice: string | null;
  PurchaseOrder: string | null;
  InspectionCertificate: string | null;
  VerificationTime: string | null;
  Remark: string | null;
  ReceiptNoteUploadTime: Date | null;
  TaxInvoiceUploadTime: Date | null;
  GSTInvoiceUploadTime: Date | null;
  ModificationAdviceUploadTime: Date | null;
  PurchaseOrderUploadTime: Date | null;
  InspectionCertificateUploadTime: Date | null;
  AuthorizationCommittee: string | null;
  NoteGeneration: string | null;
}



export async function getfiledata(prompt: string, file: string) {
    try {
        console.log("gpt reached",file[0]);

        // const wordconversion = await processPdfFromBase64(file);
        // console.log("word conversion successful",wordconversion);

        // const base64topdf = await convertBase64ToPdf(file);
        // console.log("pdf converted",base64topdf)
        // const extractedText = await runPythonScript('file.py');
        

        // const extractedText = await extractTextFromPDF(file);
        // console.log("text extracted from parse file",extractedText);


        // const extractedText =await mistralOcr(file,prompt);
        // const extractedText = await processPDFFromBase64(file, prompt);


        //save base64 in text file 
        //ocrmypdf
        // const savebase64 = await saveTextToFile(file);
        // const textfrompdf = await runPythonScript('./src/service/file.py')
        // const extractedText = await readFromTxtFile('./src/service/extracted.txt')
        let extractedText = "";
        try {
          const response = await axios.post('https://flaskocr-bwctd7d9d0gvgveu.canadacentral-01.azurewebsites.net/ocr', {
            pdfBase64: file
          });
          extractedText = response.data.text;
          console.log("Extracted text:", response.data.text);
        } catch (error) {
          console.error("OCR Error:", error.response?.data || error.message);
        }
        
        console.log("python response",extractedText)
        
        // console.log("prompt:",prompt);
        // const extractedText = "";
        console.log("extracted text",extractedText);
        
        const jsonPrompt = `${prompt} 

              Return only valid JSON.
              The document given to you will be the extracted text using ocr and might not be properly structured but the keep the values same and process accordingly(consider ] as a distinction between columns if it is in a table row)
              Document:
              ${extractedText}`;
        // console.log("json prompt",jsonPrompt)
        return await getGpt4oResponse(jsonPrompt, {extractedText});
    } catch (error) {
        console.error("Error in getfiledata:", error);
        throw error;
    }
}


function readFromTxtFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf8', (err, data) => {
          if (err) {
              reject(`An error occurred while reading the file: ${err.message}`);
              return;
          }
          resolve(data);
      });
  });
}


async function extractTextFromPDF(base64File: string): Promise<string> {
  try {
    // Validate input
    if (!base64File || typeof base64File !== 'string') {
      throw new Error('Invalid base64 input: Must be a non-empty string');
    }

    // Extract pure base64 (remove data URI prefix if present)
    // const base64Data = base64File.includes(',') 
    //   ? base64File.split(',')[1] 
    //   : base64File;

    // Validate base64 format
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64File)) {
      throw new Error('Invalid base64 format');
    }

    // Convert to buffer
    const buffer = Buffer.from(base64File, 'base64');
    
    // Empty buffer check
    if (buffer.length === 0) {
      throw new Error('Empty file content');
    }

    // Determine file type and process
    if (isPDF(buffer)) {
      const data = await pdfParse(buffer);
      if (!data.text) throw new Error('PDF parsing returned no text');
      return data.text;
    } else if (isDOCX(buffer)) {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } else {
      throw new Error('Unsupported file type. Only PDF and DOCX are supported');
    }
  } catch (error) {
    console.error('Text extraction failed:', error);
    throw new Error(`Text extraction failed: ${error.message}`);
  }
}

// Helper functions to detect file types
function isPDF(buffer: Buffer): boolean {
  // PDF magic number: %PDF
  return buffer.length > 4 && 
         buffer.toString('utf8', 0, 4) === '%PDF';
}

function isDOCX(buffer: Buffer): boolean {
  // DOCX magic number: PK\x03\x04 (ZIP format)
  return buffer.length > 4 && 
         buffer[0] === 0x50 && 
         buffer[1] === 0x4B && 
         buffer[2] === 0x03 && 
         buffer[3] === 0x04;
}









export const expenditureService = {
  getExpenditureData: async () => {
    try {
      const [data] = await Promise.all([
        expenditurebills.findAll({ 
          raw: true,
          order: [['createdAt', 'DESC']]
        }),
      ]);
      // console.log("backend fetched data",data);
      return data.map((item: any) => ({
        SNo: item.SNo,
        ReceiptNote: item.ReceiptNote,
        TaxInvoice: item.TaxInvoice,
        GSTInvoice: item.GSTInvoice,
        ModificationAdvice: item.ModificationAdvice,
        PurchaseOrder: item.PurchaseOrder,
        InspectionCertificate: item.InspectionCertificate,
        Status: item.Status,
        VerificationTime: item.VerificationTime,
        AuthorizationCommittee: item.AuthorizationCommittee,
        Remark: item.Remark,
        NoteGeneration: item.NoteGeneration,

        ReceiptNoteUploadTime: item.ReceiptNoteUploadTime,
        TaxInvoiceUploadTime: item.TaxInvoiceUploadTime,
        GSTInvoiceUploadTime: item.GSTInvoiceUploadTime,
        ModificationAdviceUploadTime: item.ModificationAdviceUploadTime,
        PurchaseOrderUploadTime: item.PurchaseOrderUploadTime,
        InspectionCertificateUploadTime: item.InspectionCertificateUploadTime,
      }));
    } catch (error) {
      console.error('Error fetching expenditure data:', error);
      throw error;
    }
  },

  updateExpenditureData: async (rowData: ExpenditureRowDB) => {
    const transaction = await sequelize.transaction();
    try {
      let newSNo = rowData.SNo;
      const data = await Promise.all([
        expenditurebills.findAll({ 
          raw: true,
          where: {
            SNo: newSNo  // Filter by specific SNo value 
          },
        }),
      ]);
      
      const row=data[0][0] === undefined ? rowData : data[0][0];
      console.log("hello");
      console.log("the row data  0", data);
      console.log("the row data 1", data[0]);
      console.log("the row data 2", rowData.Status);
      
      const dbRowData = {
        SNo: newSNo,
        Status: rowData.Status? rowData.Status : row["Status"] || 'pending',
        // Committee: row["Committee"] ? rowData.Committee : row["Committee"],
        ReceiptNote: row["ReceiptNote"] === "success" ? row["ReceiptNote"] : rowData.ReceiptNote,
        TaxInvoice: row["TaxInvoice"] === "success" ? row["TaxInvoice"] : rowData.TaxInvoice,
        GSTInvoice: row["GSTInvoice"] === "success" ? row["GSTInvoice"] : rowData.GSTInvoice,
        ModificationAdvice: row["ModificationAdvice"] === "success" ? row["ModificationAdvice"] : rowData.ModificationAdvice,
        PurchaseOrder: row["PurchaseOrder"] === "success" ? row["PurchaseOrder"] : rowData.PurchaseOrder,
        InspectionCertificate: row["InspectionCertificate"] === "success" ? row["InspectionCertificate"] : rowData.InspectionCertificate,
        VerificationTime: row["VerificationTime"] === null ? rowData.VerificationTime : row["VerificationTime"],
        Remark: rowData.Remark !== null ? rowData.Remark : row["Remark"],
        AuthorizationCommittee: (row["AuthorizationCommittee"] === "-" || row["AuthorizationCommittee"] === null) ? rowData.AuthorizationCommittee : row["AuthorizationCommittee"],
        NoteGeneration: row["NoteGeneration"] === null ? (rowData.NoteGeneration? rowData.NoteGeneration : row["NoteGeneration"]) : row["NoteGeneration"],
        //upload times
        ReceiptNoteUploadTime: row["ReceiptNoteUploadTime"] === null ? rowData.ReceiptNoteUploadTime : row["ReceiptNoteUploadTime"],
        TaxInvoiceUploadTime: row["TaxInvoiceUploadTime"] === null ? rowData.TaxInvoiceUploadTime : row["TaxInvoiceUploadTime"],
        GSTInvoiceUploadTime: row["GSTInvoiceUploadTime"] === null ? rowData.GSTInvoiceUploadTime : row["GSTInvoiceUploadTime"],
        ModificationAdviceUploadTime: row["ModificationAdviceUploadTime"] === null ? rowData.ModificationAdviceUploadTime : row["ModificationAdviceUploadTime"],
        PurchaseOrderUploadTime: row["PurchaseOrderUploadTime"] === null ? rowData.PurchaseOrderUploadTime : row["PurchaseOrderUploadTime"],
        InspectionCertificateUploadTime: row["InspectionCertificateUploadTime"] === null ? rowData.InspectionCertificateUploadTime : row["InspectionCertificateUploadTime"],

      };
  
      console.log("Attempting update for SNo:", rowData.SNo);
      console.log("Data to update:", dbRowData);
  
      let result;
  
      if (dbRowData.SNo) {
        // Update existing record
        let updatedCount: number = 0;
        try {
          const existingRecord = await expenditurebills.findOne({
            where: { SNo: rowData.SNo },
            raw: true,
          });
          // console.log("Existing DB record with this SNo:", existingRecord);
          const [count] = await expenditurebills.update(dbRowData, {
            where: { SNo: dbRowData.SNo },
            transaction,
          });
  
          updatedCount = count;
          console.log("Updated rows count:", updatedCount);

          // If status is not 'pending', update ExpenditureReport as well
          if (dbRowData.Status && dbRowData.Status !== 'pending') {
            await ExpenditureReport.update(
              { Status: dbRowData.Status },
              { where: { SNo: dbRowData.SNo }, transaction }
            );
            console.log("ExpenditureReport status updated for SNo:", dbRowData.SNo);
          }
        } catch (error) {
          console.error("Error updating record:", error);
          await transaction.rollback();
          return {
            success: false,
            message: "Failed to update record: " + error.message,
          };
        }
  
        if (updatedCount === 0) {
          // No record found, create new
          try {
            console.log("starting row creation");
            const created = await expenditurebills.create(dbRowData, { transaction });
            console.log("row creation completed",created);
            result = { success: true, message: "New record created" };
          } catch (error) {
            console.error("Error creating new record:", error);
            await transaction.rollback();
            return {
              success: false,
              message: "Failed to create new record: " + error.message,
            };
          }
        } else {
          result = { success: true, message: "Record updated successfully" };
        }
      } else {
        console.log("no SNo provided");
        return;
      }
  
      await transaction.commit();
      console.log("Transaction committed successfully");
      return result;
    } catch (error) {
      await transaction.rollback();
      console.error("Error in updateExpenditureData:", error);
      return {
        success: false,
        message: "Failed to update data: " + error.message,
      };
    }
  },

  getGstInvoiceData: async () => {
    try {
      console.log("starting gst data fetching")
      const data = await ExpenditureReport.findAll({ 
        raw: true,
        order: [["Created", "DESC"]]
      });
      
      console.log("Dashboard data fetched successfully");
      return data;
    } catch (error) {
      console.error('Error fetching GST Invoice data:', error);
      throw error;
    }
  },

  putNoteData: async (documentType: string, row: any) => {
    try {
      if (documentType === 'FinanceNote') {
        const { SNo, co6No, ld, sd, otherDeductions, netPayment} = row;
        console.log("these",SNo, co6No, ld, sd, otherDeductions, netPayment)

        
        await FinanceNote.create({
          SNo: SNo || null,
          CO6No: co6No || null,
          Ld: ld || null,
          Sd: sd || null,
          Otherdedunctions: otherDeductions || null,
          NetPayment: netPayment || null,
          Created: null,
        });
        return { success: true, message: 'FinanceNote inserted successfully' };
      } else if (documentType === 'RejectionNote') {
        console.log("return note generation")

        const { SNo, MA, GSTR2A, CopyTaxIC, Refund, InvoiceCO6 } = row;
        console.log("jhj",SNo, MA, GSTR2A, CopyTaxIC, Refund, InvoiceCO6)
        
        await RejectionNote.create({
          SNo,
          MA,
          GSTR2A,
          CopyTaxIC,
          Refund,
          InvoiceCO6,
          Created: null,
        });
        return { success: true, message: 'RejectionNote inserted successfully' };
      } else {
        return { success: false, message: 'Invalid document type' };
      }
    } catch (error) {
      console.error('Error in putNoteData:', error);
      return { success: false, message: error.message };
    }
  },

  getNoteData: async (documentType: string, SNo: any) => {
    try {
      if (documentType === 'FinanceNote') {
        // Fetch by SNo if provided, else fetch all
        if (SNo) {
          const data = await FinanceNote.findOne({ where: { SNo: SNo }, raw: true });
          return { success: true, data };
        } else {
          return { success: false,};
        }
      } else if (documentType === 'RejectionNote') {
        if (SNo) {
          const data = await RejectionNote.findOne({ where: { SNo: SNo }, raw: true });
          return { success: true, data };
        } else {
          return { success: false,};
        }
      } else {
        return { success: false, message: 'Invalid document type' };
      }
    } catch (error) {
      console.error('Error in getNoteData:', error);
      return { success: false, message: error.message };
    }
  },
  
};





export async function putfiledatatodb(data: any, documentType: any, rowId: number) {
  console.log("Starting putfiledatatodb function...");
  console.log("Document Type:", documentType);
  console.log("Row ID:", rowId);
  
  const transaction = await sequelize.transaction();

  if (documentType === "ReceiptNote") {
    const row = {
      SNo: rowId,
      RNoteNo: data["R/Note-No."],
      Date: data["Date(Challan Date)"],
      VenderCode: data["Vendor Code"],
      SupplierName: data["Supplier Name"],
      SupplierAddress: data["Supplier Address"],
      POAtNo: data["PO/AT No."],
      PLNo: data["PL No."],
      RONo: data["R.O.No."],
      RODate: data["R.O.Date"],
      RNQuantity: data["RN Quantity"],
      Rate: data.Rate,
      Value: data.Value,
      POSrNo: data["P.O.Sr.No."],
      FreightCharges: data.Freight,
      InspectionAgency: data["Inspection agency"],
      ICNo: data["IC no."],
      Dated: data.dated,
      InvoiceNo: data["Challan/invoice no."],
      QtyInvoiced: data["Qty. Invoiced"],
      QtyReceived: data["Qty. Received"],
      QtyAccepted: data["Qty. Accepted"],
      QtyRejected: data["Qty. Rejected"]
    };
    console.log("receipt note row",row)
    try {
      await ReceiptNote.sync({ alter: true });
      
      await ReceiptNote.create(row, { transaction });
      
      await transaction.commit();
      
      return { success: true, message: "Receipt note data saved successfully" };
    } catch (error) {
      console.error("Error in ReceiptNote creation:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      await transaction.rollback();
      throw error;
    }
  } else if (documentType === "TaxInvoice") {
    const row = {
      SNo: rowId,
      SupplierName: data["Supplier Name"],
      SupplierAddress: data["Supplier Address"],
      GstNo: data["GST No."],
      SupplierPAN: data["Supplier PAN"],
      CIN: data.CIN,
      InvoiceNo: data["Invoice No."],
      Date: data.Date,
      Quantity: data.Qty,
      Rate: data.Rate,
      FreightCharges: data["Freight Charges"],
      GstAmt: data["GST Amount"],
      TotalAmt: data["Total Sales Amount(after gst addition)"],
      Destination: data.Destination,
      DispatchThrough: data["Dispatched through"],
      EwayBillNo: data["e-Way Bill no."],
      BillOfLanding: data["Bill of Landing/LR-RR No."],
      HsnCode: data["HSN Code"]
    };
    console.log("tax invoice row",row)
    try {
      await TaxInvoice.sync({ alter: true });
      
      const answer = await TaxInvoice.create(row, { transaction });
      
      await transaction.commit();
      
      return { success: true, message: "Tax invoice data saved successfully" };
    } catch (error) {
      console.error("Error in TaxInvoice creation:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      await transaction.rollback();
      throw error;
    }
  } else if (documentType === "GSTInvoice") {
    const row = {
      SNo: rowId,
      TaxInvoiceNo: data["Tax invoice no."],
      IREPSBillRegNo: data["IREPS Bill Reg No."],
      TaxInvoiceDate: data["Tax invoice date"],
      InvoiceAmount: data["Invoice Amount"],
      RNoteNo: data["Rnote no."],
      RNoteDate: data["Rnote date 2"],
      RONo: data["RO No."],
      RODate: data["RO Date"],
      RNoteQty: data["Rnote Qty"],
      RNoteValue: data["Rnote Value"],
      PORate: data["PO Rate"],
      POSrNo: data["PO Sr No"],
      PLNo: data["PL No"],
      PONo: data["PO No"],
      HSNCode: data["HSN Code"],
      SupplierName: data["Supplier Name"],
      SupplierAddress: data["Supplier Address"],
      SupplierGSTIN: data["Supplier GSTIN"],
      InspectionAgency: data["Inspection Agency"],
      VenderCode: data["Vendor Code"],
    };
    console.log("gst invoice row",row)
    try {
      await GstInvoice.sync({ alter: true });
      
      await GstInvoice.create(row, { transaction });
      
      await transaction.commit();
      
      return { success: true, message: "GST invoice data saved successfully1",data: row.IREPSBillRegNo };
    } catch (error) {
      console.error("Error in GSTInvoice creation:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      await transaction.rollback();
      throw error;
    }
    
  } else if (documentType === "ModificationAdvice") {
    // const modificationData = data["Modification Advice Verification"];
    const row = {
      SNo: rowId,
      PONo: data["P.O.No."],
      SupplierName: data["Supplier Name"],
      SupplierAddress: data["Supplier Address"],
      POSr: data["P.O.Sr."],
      PLNo: data["PL no"],
      VCode: data["Vcode"],
    };
    console.log("modification advice row",row)
    try {
      await ModificationInvoice.sync({ alter: true });
      
      await ModificationInvoice.create(row, { transaction });
      
      await transaction.commit();
      
      return { success: true, message: "Modification advice data saved successfully" };
    } catch (error) {
      console.error("Error in ModificationInvoice creation:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      await transaction.rollback();
      throw error;
    }
  } else if (documentType === "PurchaseOrder") {
    const row = {
      SNo: rowId,
      PONumber: data["PO No."],
      InspectionAgency: data["Inspection Agency"],
      BasicRate: data["Basic Rate"],
      POSr: data["PO Sr."],
      PLNo: data["PL No"],
      OrderedQuantity: data["Ordered Quantity"],
      FreightCharges: data["Freight Charges"],
      SecurityMoney: data["Security Money"]
    };
    console.log("purchase order row",row)
    try {
      await PurchaseOrder.sync({ alter: true });
      
      await PurchaseOrder.create(row, { transaction });
      
      await transaction.commit();
      
      return { success: true, message: "Purchase order data saved successfully" };
    } catch (error) {
      console.error("Error in PurchaseOrder creation:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
     
      await transaction.rollback();
      
      throw error;
    }
  } else if (documentType === "InspectionCertificate") {
    const row = {
      SNo: rowId,
      CertificateNo: data["Certificate no."],
      PONo: data["PO Number"],
      Date: data["Date"],
      ICCountNo: data["IC Count No."],
      POSerialNo: data["PO Serial Number"],
      InspectionQtyDetails: data["Inspection Qty Details"],
      OrderQty: data["Order Qty"],
      QtyOffered: data["Qty Offered"],
      QtyNotDue: data["Qty Not Due"],
      QtyPassed: data["Qty Passed"],
      QtyRejected: data["Qty Rejected"]
    };
    console.log("inspection certificate row",row)
    try {
      await InspectionCertificate.sync({ alter: true });
      
      await InspectionCertificate.create(row, { transaction });
      
      await transaction.commit();
      
      return { success: true, message: "Inspection certificate data saved successfully" };
    } catch (error) {
      console.error("Error in InspectionCertificate creation:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      console.log("Rolling back transaction...");
      await transaction.rollback();
      console.log("Transaction rolled back");
      throw error;
    }
  }
  console.log("Invalid document type:", documentType);
  return { success: false, message: "Invalid document type"};
}




export async function verifyData(rowData: ExpenditureRowDB): Promise<{ Results: string[], Status: string }> {
  console.log("Starting verification process...");
  console.log("Input row data:", rowData);

  if (!rowData || !rowData.SNo) {
    console.error("Invalid row data: SNo is undefined or missing");
    throw new Error("Invalid row data: SNo is required for verification");
  }

  try {

    // const expenditurebillsdata = await expenditurebills.findAll({ 
    //   raw: true, 
    //   where: { SNo: rowData.SNo }
    // });
    const recieptnotedata = await ReceiptNote.findAll({ 
      raw: true, 
      where: { SNo: rowData.SNo }
    });
    const taxinvoicedata = await TaxInvoice.findAll({ 
      raw: true, 
      where: { SNo: rowData.SNo }
    });
    const gstinvoicedata = await GstInvoice.findAll({ 
      raw: true, 
      where: { SNo: rowData.SNo }
    });
    const modificationadvicedata = await ModificationInvoice.findAll({ 
      raw: true, 
      where: { SNo: rowData.SNo }
    });
    const purchaseorderdata = await PurchaseOrder.findAll({ 
      raw: true, 
      where: { SNo: rowData.SNo }
    });
    const inspectioncertificatedata = await InspectionCertificate.findAll({ 
      raw: true, 
      where: { SNo: rowData.SNo }
    });
    

    console.log("All data fetched successfully. Starting verification...");
    try {
      const jsonPrompt = `
     You are a validation assistant designed to compare structured procurement documents such as Receipt Notes, Tax Invoices, GST Invoices, Purchase Orders, Modification advice and Inspection Certificates.

You will receive six JSON objects:
- receiptNote
- taxInvoice
- gstInvoice
- purchaseOrder
- inspectionCertificate
- modificationadvice

Your job is to compare the following fields between these documents. If any values do not match, add a human-readable string to a Results array. If a value is missing or null, treat it as the string 'null'.

Use the following format for each match:
"<Field Name> matching in <Document1> (<value1>) and <Document2> (<value2>) and <Document3> (<value3>) "(likewise create the string for the no of documents we are comapring the feild in)

Use the following format for each mismatch:
"<Field Name> not matching in <Document1> (<value1>) and <Document2> (<value2>) and <Document3> (<value3>) "(likewise create the string for the no of documents we are comapring the feild in)


At the end, return a valid JSON object in this format:
{ 
  "UnmatchedResults": [ results ],
  "MatchedResults": [ results ],
  "Status": "Approved" or "Rejected"
}
Important: In the Results array, return all the mismatched lines first in the UnmatchedResults, followed by the matching values in the MatchedResults.



# Fields to Compare Between Documents:

1. RNoteNo
   receiptNote.RNoteNo    vs    gstInvoice.RNoteNo
   (For RNoteNo comparisons, consider a match if the receiptNote value contains or ends with the gstInvoice value, especially if the gstInvoice value represents the last few digits of the receiptNote (e.g., '4225100657' and '5100657'))

2. Date(If date,month and year is matching then it is a pass)
   receiptNote.Date   vs    taxInvoice.Date     vs      gstInvoice.TaxInvoiceDate
   (Convert all dates to dd/mm/yy format (e.g., 05/01/2025 → 05/01/25). Then, check if the dates match or not and also in the points all dates shoulld be in the format dd/mm/yy)

3. SupplierName(if some of it is matching then pass)
   receiptNote.SupplierName     vs    taxInvoice.SupplierName     vs    gstInvoice.SupplierName       vs        modificationadvice.SupplierName
   (For SupplierName comparisons, prioritize the core business name, ignoring prefixes like 'M/s', common abbreviations like '(PVT)' for 'PVT LTD', and geographical suffixes like '-KOLKATA' to allow for minor stylistic variations.)

4. SupplierAddress(if some of it is matching then pass)
   receiptNote.SupplierAddress    vs     taxInvoice.SupplierAddress     vs      gstInvoice.SupplierAddress      vs      modificationadvice.SupplierAddress
   (For SupplierAddress comparisons, focus on key geographical identifiers such as plot numbers, area names (e.g., 'RIICO Industrial Area'), and town/city names, disregarding minor differences in departmental names, state/country specifics, or punctuation and spacing.)

5. PO Number
   receiptNote.POAtNo   vs     purchaseOrder.PONumber    vs    gstInvoice.PONo    vs      inspectionCertificate.PONo        vs      modificationadvice.PONo

6. PL No.
   receiptNote.PLNo     vs      gstInvoice.PLNo     vs      purchaseOrder.PLNo    vs    modificationadvice.PLNo 

7. RN Quantity
   receiptNote.RNQuantity     vs      gstInvoice.RNoteQty      vs      taxInvoice.Quantity      vs      inspectionCertificate.QtyPassed

8. Rate
    receiptNote.Rate      vs      taxInvoice.Rate       vs        gstInvoice.PORate       vs       purchaseOrder.BasicRate
    (Compare the actual value by rounding it off. A deviation of ±1 from the expected value is acceptable and will be considered a pass.)

9. Value
    receiptNote.Value       vs        taxInvoice.TotalAmt       vs        gstInvoice.InvoiceAmount
    (Compare the actual value by rounding it off. A deviation of ±1 in numeric operations from other values is acceptable will be considered a match.)


10. Inspection Agency
    receiptNote.InspectionAgency        vs          purchaseOrder.InspectionAgency        vs          gstInvoice.InspectionAgency
    (If the gstInvoice contains 'InspectionAgency' as 'TPI' and either the receiptNote or purchaseOrder contains the agency's name, it should be considered a match. Additionally, if the receiptNote is mentioned within the text of the purchaseOrder, it should also be treated as a match.)

11. Invoice No.
    receiptNote.InvoiceNo        vs          gstInvoice.TaxInvoiceNo        vs          taxInvoice.InvoiceNo

12. Qty Invoiced vs Qty Received
    receiptNote.QtyInvoiced         vs         receiptNote.QtyReceived

13. GST No.
    taxInvoice.GstNo           vs           gstInvoice.SupplierGSTIN

14. HSN Code
    taxInvoice.HsnCode          vs          gstInvoice.HSNCode

15. Certificate No.
    inspectionCertificate.CertificateNo          vs          receiptNote.ICNo 
    
16. IC No.
    inspectionCertificate.CertificateNo          vs          receiptNote.ICNo 

17. Dated
    inspectionCertificate.Date          vs          receiptNote.Dated 
    (Convert all dates to dd/mm/yy format (e.g., 05/01/2025 → 05/01/25). Then, check if the dates match or not.)
    
18. Quantity Rejected
    inspectionCertificate.QtyRejected          vs          receiptNote.QtyRejected 

19. Vender Code
    modificationAdvice.VCode          vs          receiptNote.VenderCode        vs        gstInvoice.VenderCode 

If 'InspectionCertificate' or 'ModificationAdvice' is missing, treat their absence as non-critical and do not flag it, make the point as matched if other values are matching. However, if they are present, their values should be considered and validated accordingly.
For each comparison, always provide a single line indicating whether the fields match or not, along with any discrepancies.Make intelligent, human-like decisions regarding data matching, considering tolerances and common data artifacts.
All matching and transformations are critical and must be properly followed during data processing.
`;


      console.log("Preparing data for GPT verification...");
      const verificationData = {
        recieptnotedata,
        taxinvoicedata,
        gstinvoicedata,
        modificationadvicedata,
        purchaseorderdata,
        inspectioncertificatedata
      };
      console.log("Data prepared for verification:", verificationData);


      console.log("Sending data to GPT for verification...");
      const testanswer = await getGpt4oResponse(jsonPrompt, {verificationData});
      console.log("Verification result received:", testanswer);

      if (testanswer) {
        if (Array.isArray(testanswer.UnmatchedResults)) {
          testanswer.UnmatchedResults = testanswer.UnmatchedResults.map(
            (item: string) => item.endsWith("(AI (-)(-)(-))") ? item : item + " (AI (-)(-)(-))"
          );
        }
        if (Array.isArray(testanswer.MatchedResults)) {
          testanswer.MatchedResults = testanswer.MatchedResults.map(
            (item: string) => item.endsWith("(AI (-)(-)(-))") ? item : item + " (AI (-)(-)(-))"
          );
        }
      }

      let formattedRemark = '';
      if (testanswer.MatchedResults && Array.isArray(testanswer.MatchedResults)) {
        formattedRemark = [
          'Unmatched Results',
          testanswer.UnmatchedResults.map((result: string) => `• ${result}`).join('\n'),
          '',
          'Matched Results',
          testanswer.MatchedResults.map((result: string) => `• ${result}`).join('\n'),
        ].join('\n')
        console.log("formatted remark",formattedRemark)
      } else if (testanswer.Reason) {
        formattedRemark = testanswer.Reason;
      }


      // Create a row in ExpenditureReport model
      try {
        const ExpenditureReport = require("../Model/ExpenditureReport.model").ExpenditureReport;
        await ExpenditureReport.sync({ alter: true });
        // Ensure we are working with plain objects
        const receiptNote = recieptnotedata?.[0] ? (typeof recieptnotedata[0].get === 'function' ? recieptnotedata[0].get({ plain: true }) : recieptnotedata[0]) : null;
        const taxInvoice = taxinvoicedata?.[0] ? (typeof taxinvoicedata[0].get === 'function' ? taxinvoicedata[0].get({ plain: true }) : taxinvoicedata[0]) : null;
        const gstInvoice = gstinvoicedata?.[0] ? (typeof gstinvoicedata[0].get === 'function' ? gstinvoicedata[0].get({ plain: true }) : gstinvoicedata[0]) : null;
        const purchaseOrder = purchaseorderdata?.[0] ? (typeof purchaseorderdata[0].get === 'function' ? purchaseorderdata[0].get({ plain: true }) : purchaseorderdata[0]) : null;
        const reportRow = {
          SNo: receiptNote?.SNo || null,
          IREPSNo: gstInvoice?.IREPSBillRegNo || null,
          Status: testanswer.Status,
          PONo: gstInvoice?.PONo || null,
          Consignee: receiptNote.SupplierName, // No direct mapping in available data
          InvoiceNo: gstInvoice?.TaxInvoiceNo || null,
          InvoiceDate: gstInvoice?.TaxInvoiceDate || null,
          RNoteNo: receiptNote?.RNoteNo || gstInvoice?.RNoteNo || null,
          QtyAccepted: receiptNote?.QtyAccepted || null,
          TotalAmt: gstInvoice?.InvoiceAmount || null,
          Security: purchaseOrder?.SecurityMoney || null,
          Remarks: testanswer ? formattedRemark : null,
          // Remarks: testanswer ? JSON.stringify(out) : null,
          Created: new Date()
        };
        await ExpenditureReport.create(reportRow);
        console.log("ExpenditureReport row created", reportRow);
      } catch (error) {
        console.error("Error in ExpenditureReport creation:", error);
      }



      return testanswer;


    } catch (error) {
      console.error("Error in GPT verification:", error);
      console.error("Error details:", {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  } catch (error) {
    console.error("Error fetching data during verification:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      stack: error.stack,
      rowData: rowData
    });
    throw error;
  }
}


export async function updateExpenditureReportData(row: any) {
  try {
    const {
      SNo,
      IREPSNo,
      Status,
      PONo,
      Consignee,
      InvoiceNo,
      InvoiceDate,
      RNoteNo,
      QtyAccepted,
      TotalAmt,
      Security,
      Remarks,
      Created
    } = row;

    // Only update if SNo is provided
    if (!SNo) {
      return { success: false, message: 'SNo is required for update' };
    }

    // Prepare update data (only include fields that are not undefined)
    const updateData: any = {};
    if (IREPSNo !== undefined) updateData.IREPSNo = IREPSNo;
    if (Status !== undefined) updateData.Status = Status;
    if (PONo !== undefined) updateData.PONo = PONo;
    if (Consignee !== undefined) updateData.Consignee = Consignee;
    if (InvoiceNo !== undefined) updateData.InvoiceNo = InvoiceNo;
    if (InvoiceDate !== undefined) updateData.InvoiceDate = InvoiceDate;
    if (RNoteNo !== undefined) updateData.RNoteNo = RNoteNo;
    if (QtyAccepted !== undefined) updateData.QtyAccepted = QtyAccepted;
    if (TotalAmt !== undefined) updateData.TotalAmt = TotalAmt;
    if (Security !== undefined) updateData.Security = Security;
    if (Remarks !== undefined) updateData.Remarks = Remarks;
    if (Created !== undefined) updateData.Created = Created ? new Date(Created) : null;

    const [updatedCount] = await ExpenditureReport.update(updateData, {
      where: { SNo },
    });

    if (updatedCount === 0) {
      return { success: false, message: 'No record found to update for SNo: ' + SNo };
    }
    return { success: true, message: 'ExpenditureReport updated successfully' };
  } catch (error) {
    console.error('Error in updateExpenditureReportData:', error);
    return { success: false, message: error.message };
  }
}










