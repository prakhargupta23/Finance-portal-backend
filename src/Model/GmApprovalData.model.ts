


import { DataTypes } from "sequelize";
import sequelize from "../config/sequelize";
import DocumentMaster from "./DocumentMaster.model";

const GmApprovalData = sequelize.define(
  "GmApprovalData",
  {
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    s_no: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    planhead: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    workname: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    division: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    allocation: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    sanctioned_cost: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    executing_agency: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    letter_no: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    subject: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    reference: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    gmApprovalDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    gmApprovalTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },

    rawText: {
      type: DataTypes.TEXT,
      allowNull: true,
    }
  },
  {
    tableName: "GmApprovalData",
    timestamps: true,
    indexes: [
      { fields: ["s_no"] },
      { fields: ["planhead"] },
      { fields: ["workname"] },
      { fields: ["createdAt"] }
    ]
  }
);

GmApprovalData.belongsTo(DocumentMaster, {
  foreignKey: "s_no",
  targetKey: "s_no",
  onDelete: "CASCADE",
});

DocumentMaster.hasMany(GmApprovalData, {
  foreignKey: "s_no",
  sourceKey: "s_no",
  as: "gmData"
});

export default GmApprovalData;