import { DataTypes } from "sequelize";
import sequelize from "../config/sequelize";

const WorkVettingDesignationFlowItem = sequelize.define(
  "WorkVettingDesignationFlowItems",
  {
    uuid: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },

    flowUuid: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    sequenceNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    designation: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    department: {
      type: DataTypes.STRING(255),
      allowNull:true
    },

    actionDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    actionTime: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },

    isCurrentPending: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    tableName: "WorkVettingDesignationFlowItems",
    timestamps: true,
    indexes: [
      { fields: ["flowUuid"] },
      { unique: true, fields: ["flowUuid", "sequenceNo"] },
    ],
  }
);

export default WorkVettingDesignationFlowItem;