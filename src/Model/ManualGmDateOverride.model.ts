import { Model, DataTypes } from "sequelize";
import sequelize from "../config/sequelize";

class ManualGmDateOverride extends Model {
    public id!: number;
    public s_no!: string;
    public planhead!: string | null;
    public workname!: string | null;
    public manualGmDate!: string | null;
    public addedByRole!: string | null;
    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;
}

ManualGmDateOverride.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        s_no: {
            type: DataTypes.STRING(255),
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
        manualGmDate: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        addedByRole: {
            type: DataTypes.STRING(255),
            allowNull: true,
            defaultValue: "User",
        },
    },
    {
        sequelize,
        tableName: "ManualGmDateOverrides",
        timestamps: true,
        indexes: [
            { fields: ["s_no"] },
            { fields: ["planhead"] }
        ]
    }
);

export default ManualGmDateOverride;
