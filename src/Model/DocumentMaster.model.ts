import { DataTypes } from "sequelize";
import sequelize from "../config/sequelize";

const DocumentMaster = sequelize.define(
    "DocumentMaster",
    {
        s_no: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
            unique: true
        },

        // DRM APP
        drm_app_file_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        drm_app_file_url: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        drm_app_uploaded: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },

        // D&G Letter
        dg_letter_file_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        dg_letter_file_url: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        dg_letter_uploaded: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },

        // Estimate Reference
        estimate_file_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        estimate_file_url: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        estimate_uploaded: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },

        // Func Distribution
        func_distribution_file_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        func_distribution_file_url: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        func_distribution_uploaded: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        },

        // Top Sheet
        top_sheet_file_name: {
            type: DataTypes.STRING,
            allowNull: true
        },
        top_sheet_file_url: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        top_sheet_uploaded: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    },
    {
        tableName: "DocumentMaster",
        timestamps: true
    }
);

export default DocumentMaster;
