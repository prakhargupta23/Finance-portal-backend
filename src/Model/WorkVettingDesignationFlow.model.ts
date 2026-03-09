// import { DataTypes } from "sequelize";
// import sequelize from "../config/sequelize";

// const WorkVettingDesignationFlow = sequelize.define(
//   "WorkVettingDesignationFlows",
//   {
//     uuid: {
//       type: DataTypes.UUID,
//       defaultValue: DataTypes.UUIDV4,
//       primaryKey: true,
//       allowNull: false,
//     },
//     master_id: {
//       type: DataTypes.INTEGER,
//       allowNull: true,
//     },
//     file_name: {
//       type: DataTypes.STRING(255),
//       allowNull: true,
//     },
//     file_url: {
//       type: DataTypes.TEXT,
//       allowNull: true,
//     },

//     planhead: {
//       type: DataTypes.STRING(255),
//       allowNull: true,
//     },

//     workname: {
//       type: DataTypes.TEXT,
//       allowNull: true,
//     },
//   },
//   {
//     tableName: "WorkVettingDesignationFlows",
//     timestamps: true,
//   }
// );

// export default WorkVettingDesignationFlow;/




import { DataTypes } from "sequelize";
import sequelize from "../config/sequelize";
import DocumentMaster from "./DocumentMaster.model";

const WorkVettingDesignationFlow = sequelize.define(
  "WorkVettingDesignationFlows",
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
    }
  },
  {
    tableName: "WorkVettingDesignationFlows",
    timestamps: true,
    indexes: [
      { fields: ["s_no"] },
      { fields: ["planhead"] },
      { fields: ["createdAt"] }
    ]
  }
);

WorkVettingDesignationFlow.belongsTo(DocumentMaster, {
  foreignKey: "s_no",
  targetKey: "s_no",
  onDelete: "CASCADE",
});

DocumentMaster.hasMany(WorkVettingDesignationFlow, {
  foreignKey: "s_no",
  sourceKey: "s_no",
  as: "flowData"
});

export default WorkVettingDesignationFlow;