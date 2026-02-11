import { DataTypes } from "sequelize";
import sequelize from "../config/sequelize";

const WorkVettingDesignationFlow = sequelize.define(
  "WorkVettingDesignationFlows",
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
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "WorkVettingDesignationFlows",
    timestamps: true,
  }
);

export default WorkVettingDesignationFlow;
