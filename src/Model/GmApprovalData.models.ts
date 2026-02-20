import { DataTypes } from "sequelize";
import sequelize from "../config/sequelize";

const GmApprovalData = sequelize.define(
  "GmApprovalData",
  {
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
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

    gmApprovalDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    gmApprovalTime: {
      type: DataTypes.TIME,
      allowNull: true,
    },

    rawText: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
    }
  },
  {
    tableName: "GmApprovalData",
    timestamps: true,
  }
);

export default GmApprovalData;
